import type { History, ModelInput, Publication, PredictionDetail, Factor, Market, Surface } from './types.ts';
import { clamp, DAY, decay, logit, sigmoid } from './math.ts';
import { footballForecast } from './football.ts';
import type { FootballConfig } from './football.ts';
import { DEFAULT_FOOTBALL } from './football-default.ts';
export { fitFootball } from './football.ts';
import { eligibleHistory, timestamp, validateInput } from './input.ts';

export const VERSIONS = { football: 'PA-Poisson 1.2 adapter 2.1', basketball: 'PA-Margin 2.0', tennis: 'PA-Tennis 2.0' } as const;
// Fixed before holdout evaluation. These are regularizers, not learned claims about players.
export const PARAMETERS = {
  football: DEFAULT_FOOTBALL,
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

export function predict(input: ModelInput, publication: Publication, options: { restAdjustment?: boolean; football?: FootballConfig; experimentalFootballHealth?: boolean } = {}): PredictionDetail {
  validateInput(input, publication);
  const rows = eligibleHistory(input), f = input.fixture, sport = f.sport;
  const samples = { home: count(rows, f.homeId), away: count(rows, f.awayId) };
  const result: PredictionDetail = {
    summary: { id: publication.id, fixtureId: f.id, sport, winProbability: null, expectedScore: null,
      confidence: null, availability: rows.length ? 'ready' : 'insufficient_data', modelVersion: VERSIONS[sport],
      generatedAt: publication.generatedAt, dataCutoffAt: input.asOf, isStale: publication.isStale },
    analysis: { method: { football: 'Shipped Poisson comparator', basketball: 'Recent-margin logistic', tennis: 'Recent-form and surface Elo logistic' }[sport],
      sampleSize: rows.length, participantSampleSize: samples, projectedMargin: null, topScoreline: null,
      scoreMatrix: [], markets: [], factors: [], warnings: [], featuresUsed: [],
      caveat: 'Confidence describes sample coverage and decisiveness, not calibrated accuracy. Football health adjustments are experimental, unvalidated and disabled by default.' },
  };
  const a = result.analysis, s = result.summary;
  if (!rows.length) { a.warnings.push('NO_HISTORY'); return result; }
  if (samples.home < 5 || samples.away < 5) a.warnings.push('LOW_SAMPLE');
  const h = context(input, rows, f.homeId), v = context(input, rows, f.awayId);
  a.featuresUsed.push('scores', 'recentForm');
  if (sport !== 'football') a.featuresUsed.push('timeDecay');
  if (sport === 'football') {
    const config = options.football ?? DEFAULT_FOOTBALL;
    const useHealth = options.experimentalFootballHealth === true && config.mode === 'strength';
    if (useHealth) a.warnings.push('EXPERIMENTAL_HEALTH_ADJUSTMENT');
    if (useHealth && (h.injuriesUsed || v.injuriesUsed)) a.featuresUsed.push('injuries'); else a.warnings.push('INJURIES_NOT_USED');
    if (useHealth && (h.healthUsed || v.healthUsed)) a.featuresUsed.push('teamHealth'); else a.warnings.push('TEAM_HEALTH_NOT_USED');
    if (useHealth && (!(h.healthUsed || h.injuriesUsed) || !(v.healthUsed || v.injuriesUsed))) a.warnings.push('PARTIAL_HEALTH_COVERAGE');
    const forecast = footballForecast(input, rows, config, useHealth ? {home:h.loss,away:v.loss} : undefined);
    const {lambda,mu,fit,dist,probabilities} = forecast;
    const ha=fit?.attack.get(f.homeId)??1,aa=fit?.attack.get(f.awayId)??1;
    const hd=fit?.defence.get(f.homeId)??1,ad=fit?.defence.get(f.awayId)??1;
    s.winProbability={home:probabilities[0],draw:probabilities[1],away:probabilities[2]};
    s.modelVersion=config.mode==='legacy' ? 'PA-Poisson 1.2 adapter 2.1' : `PA-Strength 2.1:h${Number(config.homeAdvantage)}:d${config.halfLifeDays??'off'}:p${config.priorMatches}:dc${config.rhoPenalty??'off'}:health${Number(useHealth)}`;
    a.method=config.mode==='legacy'?'Shipped Poisson comparator':'Opponent-adjusted Poisson strength model';
    if(config.halfLifeDays!==null)a.featuresUsed.push('timeDecay');
    s.expectedScore = { home: lambda, away: mu, total: lambda + mu, unit: 'goals' };
    a.scoreMatrix = dist.cells.filter(c => c.home <= 4 && c.away <= 4);
    a.topScoreline = { home: dist.top.home, away: dist.top.away };
    a.featuresUsed.push('attackStrength','defenceStrength');
    if(config.mode==='strength')a.featuresUsed.push('opponentAdjustment');
    if(config.rhoPenalty!==null)a.featuresUsed.push('dixonColes');
    if(config.priorMatches>0)a.featuresUsed.push('shrinkage');
    if(config.homeAdvantage)a.featuresUsed.push(f.neutralVenue&&config.mode==='strength'?'neutralVenue':'homeAdvantage');
    if(config.mode==='legacy'&&f.neutralVenue)a.warnings.push('LEGACY_NEUTRAL_VENUE_NOT_SUPPORTED');
    if(config.mode==='legacy'&&options.experimentalFootballHealth)a.warnings.push('LEGACY_HEALTH_NOT_SUPPORTED');
    if(options.football)a.warnings.push('EXPLICIT_FOOTBALL_CONFIGURATION');
    const sum = (predicate: (h: number, v: number) => boolean) => dist.cells.reduce((s, c) => s + (predicate(c.home, c.away) ? c.probability : 0), 0);
    a.markets = [market('1x2','home',probabilities[0],'Home regulation win.'), market('1x2','draw',probabilities[1],'Regulation draw.'), market('1x2','away',probabilities[2],'Away regulation win.'),
      market('double-chance','home-draw',probabilities[0] + probabilities[1],'Home win or draw.'), market('double-chance','away-draw',probabilities[2] + probabilities[1],'Away win or draw.'),
      market('total','over',sum((x,y) => x+y >= 2),'At least two regulation goals.',1.5), market('total','over',sum((x,y) => x+y >= 3),'At least three regulation goals.',2.5),
      market('total','under',sum((x,y) => x+y <= 3),'At most three regulation goals.',3.5), market('btts','yes',sum((x,y) => x>0 && y>0),'Both teams score in regulation.')];
    a.factors = forecast.old ? forecast.old.model.factors.map(f=>({...f,strength:f.strength/100})) : [factor('Home attack',ha,'Opponent-adjusted scoring strength; neutral prior.'), factor('Away attack',aa,'Opponent-adjusted scoring strength; neutral prior.'),
      factor('Home defensive concession rate',hd,'Below one means fewer goals conceded.'), factor('Away defensive concession rate',ad,'Below one means fewer goals conceded.'),
      { label:'Low-score correlation',value:dist.rho.toFixed(5),strength:clamp(Math.abs(dist.rho),0,1),tone:'neutral',detail:config.rhoPenalty===null?'Disabled by configuration.':'Regularized likelihood estimate from eligible history only.' }];
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
