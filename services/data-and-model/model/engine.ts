import type { History, ModelInput, Publication, PredictionDetail, Factor, Market, Surface } from './types.ts';
import { clamp, DAY, decay, dcBounds, dcCoefficient, logit, scoreDistribution, sigmoid } from './math.ts';
import { eligibleHistory, timestamp, validateInput } from './input.ts';

export const VERSIONS = { football: 'PA-DixonColes 2.0', basketball: 'PA-Margin 2.0', tennis: 'PA-Tennis 2.0' } as const;
// Fixed before holdout evaluation. These are regularizers, not learned claims about players.
export const PARAMETERS = {
  footballHalfLife: 90, footballPrior: 6, rhoPenalty: 100,
  basketballHalfLife: 180, basketballPrior: 0, basketballScale: 8,
  basketballMarginCoefficient: 0.7, basketballRestCoefficient: 0.5,
  tennisHalfLife: 120, tennisK: 32, tennisPrior: 5,
} as const;

const count = (rows: readonly History[], id: string) => rows.filter(r => r.homeId === id || r.awayId === id).length;
const factor = (label: string, value: number, detail: string, center = 1): Factor => ({
  label, value: value.toFixed(3), strength: clamp(value / (2 * center), 0, 1),
  tone: value > center ? 'positive' : value < center ? 'negative' : 'neutral', detail,
});
const market = (market: string, selection: string, probability: number, explanation: string, line: number | null = null): Market =>
  ({ market, selection, line, probability, kind: 'probability', explanation });

/** Latest unambiguous observations only; old observations are treated as missing. */
function context(input: ModelInput, rows: readonly History[], id: string) {
  const cutoff = timestamp(input.asOf);
  const health = (input.teamHealth ?? []).filter(h => h.participantId === id && h.source &&
    Number.isFinite(timestamp(h.observedAt)) && timestamp(h.observedAt) <= cutoff && timestamp(h.observedAt) >= cutoff - 7 * DAY &&
    Number.isFinite(h.availabilityScore) && h.availabilityScore >= 0 && h.availabilityScore <= 1 &&
    Number.isFinite(h.restDays) && h.restDays >= 0).sort((a, b) => timestamp(b.observedAt) - timestamp(a.observedAt));
  const latest = health[0];
  const validHealth = latest && !health.some(h => h.observedAt === latest.observedAt &&
    (h.availabilityScore !== latest.availabilityScore || h.restDays !== latest.restDays)) ? latest : undefined;
  // Keep injury resolution separate to avoid dependence on input order.
  const injuries = (input.injuries ?? []).filter(h => h.participantId === id && h.athleteId && h.source &&
    ['out', 'doubtful', 'available'].includes(h.status) && Number.isFinite(timestamp(h.observedAt)) &&
    timestamp(h.observedAt) <= cutoff && timestamp(h.observedAt) >= cutoff - 7 * DAY);
  let burden = 0, observedAthletes = 0;
  for (const athleteId of new Set(injuries.map(i => i.athleteId))) {
    const observations = injuries.filter(i => i.athleteId === athleteId).sort((a, b) => timestamp(b.observedAt) - timestamp(a.observedAt));
    const newest = observations[0];
    if (observations.some(i => i.observedAt === newest.observedAt && i.status !== newest.status)) continue;
    observedAthletes++;
    burden += newest.status === 'out' ? 1 : newest.status === 'doubtful' ? 0.5 : 0;
  }
  // Use the larger penalty, not the sum: injury and availability feeds often overlap.
  const loss = Math.max(validHealth ? 0.30 * (1 - validHealth.availabilityScore) : 0, Math.min(0.20, burden * 0.025));
  const previous = rows.filter(r => r.homeId === id || r.awayId === id).at(-1);
  const restDays = validHealth ? validHealth.restDays : previous ? Math.max(0, (timestamp(input.fixture.startsAt) - timestamp(previous.completedAt)) / DAY) : null;
  return { loss, healthUsed: !!validHealth, injuriesUsed: observedAthletes > 0, restDays };
}

/** Opponent- and venue-adjusted, time-weighted rates with neutral-strength priors. */
export function fitFootball(rows: readonly History[], asOf: string) {
  const weighted = rows.map(row => ({ row, w: decay((timestamp(asOf) - timestamp(row.completedAt)) / DAY, PARAMETERS.footballHalfLife) }));
  const sumW = weighted.reduce((s, r) => s + r.w, 0);
  const homeBase = (weighted.reduce((s, r) => s + r.w * r.row.homeScore, 0) + 20 * 1.45) / (sumW + 20);
  const awayBase = (weighted.reduce((s, r) => s + r.w * r.row.awayScore, 0) + 20 * 1.15) / (sumW + 20);
  const ids = [...new Set(rows.flatMap(r => [r.homeId, r.awayId]))].sort();
  let attack = new Map(ids.map(id => [id, 1]));
  let defence = new Map(ids.map(id => [id, 1]));
  const prior = PARAMETERS.footballPrior * (homeBase + awayBase) / 2;
  for (let iteration = 0; iteration < 24; iteration++) {
    const totals = new Map(ids.map(id => [id, { scored: prior, conceded: prior, attackExposure: prior, defenceExposure: prior }]));
    for (const { row: r, w } of weighted) {
      const h = totals.get(r.homeId)!, a = totals.get(r.awayId)!;
      h.scored += w * r.homeScore; h.conceded += w * r.awayScore;
      a.scored += w * r.awayScore; a.conceded += w * r.homeScore;
      h.attackExposure += w * homeBase * defence.get(r.awayId)!;
      a.attackExposure += w * awayBase * defence.get(r.homeId)!;
      h.defenceExposure += w * awayBase * attack.get(r.awayId)!;
      a.defenceExposure += w * homeBase * attack.get(r.homeId)!;
    }
    attack = new Map(ids.map(id => [id, Math.sqrt(attack.get(id)! * clamp(totals.get(id)!.scored / totals.get(id)!.attackExposure, 0.25, 3))]));
    defence = new Map(ids.map(id => [id, Math.sqrt(defence.get(id)! * clamp(totals.get(id)!.conceded / totals.get(id)!.defenceExposure, 0.25, 3))]));
  }
  let lo = -0.2, hi = 0.2;
  const likelihood = weighted.map(({ row: r, w }) => {
    const lambda = clamp(homeBase * attack.get(r.homeId)! * defence.get(r.awayId)!, 0.15, 6);
    const mu = clamp(awayBase * attack.get(r.awayId)! * defence.get(r.homeId)!, 0.15, 6);
    const bounds = dcBounds(lambda, mu); lo = Math.max(lo, bounds[0]); hi = Math.min(hi, bounds[1]);
    return { c: dcCoefficient(r.homeScore, r.awayScore, lambda, mu), w };
  });
  let rho = 0;
  for (let i = 0; i < 12; i++) {
    let gradient = -PARAMETERS.rhoPenalty * rho, curvature = -Number(PARAMETERS.rhoPenalty);
    for (const { c, w } of likelihood) {
      gradient += w * c / (1 + c * rho); curvature -= w * c * c / (1 + c * rho) ** 2;
    }
    rho = clamp(rho - gradient / curvature, lo, hi);
  }
  return { homeBase, awayBase, attack, defence, rho };
}

function weightedRecord(input: ModelInput, rows: readonly History[], id: string, halfLife: number, surface?: Surface | null) {
  let weight = 0, wins = 0, margin = 0, total = 0;
  for (const r of rows) {
    if ((r.homeId !== id && r.awayId !== id) || (surface && r.surface !== surface)) continue;
    const w = decay((timestamp(input.asOf) - timestamp(r.completedAt)) / DAY, halfLife);
    const diff = r.homeId === id ? r.homeScore - r.awayScore : r.awayScore - r.homeScore;
    weight += w; wins += w * Number(diff > 0); margin += w * diff; total += w * (r.homeScore + r.awayScore);
  }
  return { weight, wins, margin, total };
}

/** Ratings decay towards neutral between matches. Equal completion times update together. */
export function tennisRatings(rows: readonly History[], asOf: string, surface?: Surface | null) {
  const ratings = new Map<string, { value: number; at: number }>();
  const ratingAt = (id: string, time: number) => {
    const r = ratings.get(id);
    return r ? 1500 + (r.value - 1500) * decay((time - r.at) / DAY, PARAMETERS.tennisHalfLife) : 1500;
  };
  const selected = rows.filter(r => !surface || r.surface === surface);
  for (let i = 0; i < selected.length;) {
    const at = timestamp(selected[i].completedAt), updates = new Map<string, number>();
    let j = i;
    for (; j < selected.length && timestamp(selected[j].completedAt) === at; j++) {
      const r = selected[j], h = ratingAt(r.homeId, at), a = ratingAt(r.awayId, at);
      const delta = PARAMETERS.tennisK * (Number(r.homeScore > r.awayScore) - sigmoid((h - a) * Math.LN10 / 400));
      updates.set(r.homeId, (updates.get(r.homeId) ?? 0) + delta);
      updates.set(r.awayId, (updates.get(r.awayId) ?? 0) - delta);
    }
    for (const [id, delta] of updates) ratings.set(id, { value: ratingAt(id, at) + delta, at });
    i = j;
  }
  return new Map([...ratings.keys()].map(id => [id, ratingAt(id, timestamp(asOf))]));
}

export function predict(input: ModelInput, publication: Publication, options: { restAdjustment?: boolean } = {}): PredictionDetail {
  validateInput(input, publication);
  const rows = eligibleHistory(input), f = input.fixture, sport = f.sport;
  const samples = { home: count(rows, f.homeId), away: count(rows, f.awayId) };
  const result: PredictionDetail = {
    summary: { id: publication.id, fixtureId: f.id, sport, winProbability: null, expectedScore: null,
      confidence: null, availability: rows.length ? 'ready' : 'insufficient_data', modelVersion: VERSIONS[sport],
      generatedAt: publication.generatedAt, dataCutoffAt: input.asOf, isStale: publication.isStale },
    analysis: { method: { football: 'Time-weighted Dixon-Coles goal model', basketball: 'Recent-margin logistic', tennis: 'Recent-form and surface Elo logistic' }[sport],
      sampleSize: rows.length, participantSampleSize: samples, projectedMargin: null, topScoreline: null,
      scoreMatrix: [], markets: [], factors: [], warnings: [], featuresUsed: [],
      caveat: 'Confidence describes sample coverage and decisiveness, not calibrated accuracy. Optional health adjustments are bounded assumptions.' },
  };
  const a = result.analysis, s = result.summary;
  if (!rows.length) { a.warnings.push('NO_HISTORY'); return result; }
  if (samples.home < 5 || samples.away < 5) a.warnings.push('LOW_SAMPLE');
  const h = context(input, rows, f.homeId), v = context(input, rows, f.awayId);
  a.featuresUsed.push('scores', 'recentForm', 'timeDecay');
  if (sport === 'football') {
    if (h.injuriesUsed || v.injuriesUsed) a.featuresUsed.push('injuries'); else a.warnings.push('INJURIES_NOT_USED');
    if (h.healthUsed || v.healthUsed) a.featuresUsed.push('teamHealth'); else a.warnings.push('TEAM_HEALTH_NOT_USED');
    if (!(h.healthUsed || h.injuriesUsed) || !(v.healthUsed || v.injuriesUsed)) a.warnings.push('PARTIAL_HEALTH_COVERAGE');
    const fit = fitFootball(rows, input.asOf), neutral = (fit.homeBase + fit.awayBase) / 2;
    const ha = fit.attack.get(f.homeId) ?? 1, aa = fit.attack.get(f.awayId) ?? 1;
    const hd = fit.defence.get(f.homeId) ?? 1, ad = fit.defence.get(f.awayId) ?? 1;
    const lambda = clamp((f.neutralVenue ? neutral : fit.homeBase) * ha * ad * (1 - h.loss) * (1 + v.loss / 2), 0.15, 6);
    const mu = clamp((f.neutralVenue ? neutral : fit.awayBase) * aa * hd * (1 - v.loss) * (1 + h.loss / 2), 0.15, 6);
    const dist = scoreDistribution(lambda, mu, fit.rho);
    s.winProbability = { home: dist.home, draw: dist.draw, away: dist.away };
    s.expectedScore = { home: lambda, away: mu, total: lambda + mu, unit: 'goals' };
    a.scoreMatrix = dist.cells.filter(c => c.home <= 4 && c.away <= 4);
    a.topScoreline = { home: dist.top.home, away: dist.top.away };
    a.featuresUsed.push('attackStrength', 'defenceStrength', 'opponentAdjustment', 'dixonColes', f.neutralVenue ? 'neutralVenue' : 'homeAdvantage');
    const sum = (predicate: (h: number, v: number) => boolean) => dist.cells.reduce((s, c) => s + (predicate(c.home, c.away) ? c.probability : 0), 0);
    a.markets = [market('1x2','home',dist.home,'Home regulation win.'), market('1x2','draw',dist.draw,'Regulation draw.'), market('1x2','away',dist.away,'Away regulation win.'),
      market('double-chance','home-draw',dist.home + dist.draw,'Home win or draw.'), market('double-chance','away-draw',dist.away + dist.draw,'Away win or draw.'),
      market('total','over',sum((x,y) => x+y >= 2),'At least two regulation goals.',1.5), market('total','over',sum((x,y) => x+y >= 3),'At least three regulation goals.',2.5),
      market('total','under',sum((x,y) => x+y <= 3),'At most three regulation goals.',3.5), market('btts','yes',sum((x,y) => x>0 && y>0),'Both teams score in regulation.')];
    a.factors = [factor('Home attack',ha,'Opponent-adjusted scoring strength; neutral prior.'), factor('Away attack',aa,'Opponent-adjusted scoring strength; neutral prior.'),
      factor('Home defensive concession rate',hd,'Below one means fewer goals conceded.'), factor('Away defensive concession rate',ad,'Below one means fewer goals conceded.'),
      { label:'Low-score correlation',value:dist.rho.toFixed(5),strength:clamp(Math.abs(dist.rho),0,1),tone:'neutral',detail:'Regularized likelihood estimate from eligible history only.' }];
  } else {
    a.warnings.push('INJURIES_NOT_USED', 'AVAILABILITY_NOT_USED');
    const hasRest = options.restAdjustment !== false && h.restDays !== null && v.restDays !== null;
    const restDifference = hasRest ? clamp(h.restDays!, 0, 3) - clamp(v.restDays!, 0, 3) : 0;
    if (hasRest) a.featuresUsed.push('restDays'); else a.warnings.push('REST_NOT_USED');
    let probability: number;
    if (sport === 'basketball') {
      const home = weightedRecord(input, rows, f.homeId, PARAMETERS.basketballHalfLife);
      const away = weightedRecord(input, rows, f.awayId, PARAMETERS.basketballHalfLife);
      const homeMargin = home.weight ? home.margin / (home.weight + PARAMETERS.basketballPrior) : 0;
      const awayMargin = away.weight ? away.margin / (away.weight + PARAMETERS.basketballPrior) : 0;
      const weighted = rows.map(r => ({ r, w: decay((timestamp(input.asOf) - timestamp(r.completedAt)) / DAY, PARAMETERS.basketballHalfLife) }));
      const total = weighted.reduce((s, {r,w}) => s + w * (r.homeScore + r.awayScore), 0) / weighted.reduce((s,r) => s+r.w,0);
      const margin = clamp((homeMargin - awayMargin) * PARAMETERS.basketballMarginCoefficient + (f.neutralVenue ? 0 : 3.1) + restDifference * PARAMETERS.basketballRestCoefficient, -Math.min(30,total), Math.min(30,total));
      probability = sigmoid(margin / PARAMETERS.basketballScale);
      s.expectedScore = { home:(total+margin)/2, away:(total-margin)/2, total, unit:'points' };
      a.projectedMargin = margin; a.featuresUsed.push(f.neutralVenue ? 'neutralVenue' : 'homeAdvantage');
      a.factors = [factor('Home recent margin',homeMargin,'Decayed scoring margin; unseen teams use zero.'), factor('Away recent margin',awayMargin,'Same weighting and cold-start fallback.')];
    } else {
      const home = weightedRecord(input, rows, f.homeId, PARAMETERS.tennisHalfLife), away = weightedRecord(input, rows, f.awayId, PARAMETERS.tennisHalfLife);
      const rate = (r: ReturnType<typeof weightedRecord>) => (r.wins + PARAMETERS.tennisPrior / 2) / (r.weight + PARAMETERS.tennisPrior);
      const elo = tennisRatings(rows, input.asOf);
      let difference = 0.65 * (logit(rate(home)) - logit(rate(away))) + 0.35 * ((elo.get(f.homeId) ?? 1500) - (elo.get(f.awayId) ?? 1500)) * Math.LN10 / 400;
      const hs = weightedRecord(input, rows, f.homeId, PARAMETERS.tennisHalfLife, input.surface);
      const vs = weightedRecord(input, rows, f.awayId, PARAMETERS.tennisHalfLife, input.surface);
      if (input.surface && hs.weight > 0 && vs.weight > 0) {
        const blend = 0.5 * Math.min(hs.weight, vs.weight) / (Math.min(hs.weight, vs.weight) + 3);
        difference = (1-blend) * difference + blend * (logit(rate(hs)) - logit(rate(vs)));
        a.featuresUsed.push('surface');
      } else a.warnings.push('SURFACE_NOT_USED');
      if (input.bestOf != null) a.warnings.push('BEST_OF_NOT_USED');
      probability = sigmoid(difference + restDifference * 0.10);
      a.featuresUsed.push('elo');
      a.factors = [factor('Player one recent win rate',rate(home),'Five-match neutral prior and time decay.',0.5), factor('Player two recent win rate',rate(away),'Same weighting and prior.',0.5)];
    }
    s.winProbability = { home:probability, draw:null, away:1-probability };
    a.markets = [market('winner','home',probability,'Two-way model win probability.'), market('winner','away',1-probability,'Two-way model win probability.')];
    a.factors.push({label:'Rest difference',value:hasRest ? restDifference.toFixed(2) : 'Unknown',strength:hasRest ? Math.abs(restDifference)/3 : 0,tone:'neutral',detail:'Rest capped at three days per participant; zero adjustment if either is unknown.'});
  }
  const ps = Object.values(s.winProbability!).filter((p): p is number => p !== null).sort((x,y) => y-x);
  const coverage = Math.min(samples.home,samples.away) / (Math.min(samples.home,samples.away)+8);
  s.confidence = clamp(0.25 + 0.50*coverage + 0.15*(ps[0]-ps[1]),0,0.9);
  return result;
}
