import type { History, ModelInput } from './types.ts';
import { clamp, DAY, decay, dcBounds, dcCoefficient, scoreDistribution } from './math.ts';
import { timestamp } from './input.ts';
import { runFootballPoisson } from './legacy.ts';

export type FootballConfig = {
  mode: 'strength' | 'legacy';
  homeAdvantage: boolean;
  halfLifeDays: number | null;
  priorMatches: number;
  rhoPenalty: number | null;
};
export const PREVIOUS_FOOTBALL: FootballConfig = Object.freeze({mode:'strength',homeAdvantage:true,halfLifeDays:90,priorMatches:6,rhoPenalty:100});
export const LEGACY_FOOTBALL: FootballConfig = Object.freeze({mode:'legacy',homeAdvantage:true,halfLifeDays:null,priorMatches:4,rhoPenalty:null});
export function validateFootballConfig(c: FootballConfig) {
  if (!['strength','legacy'].includes(c.mode) || typeof c.homeAdvantage !== 'boolean' ||
      (c.halfLifeDays !== null && (!Number.isFinite(c.halfLifeDays) || c.halfLifeDays <= 0)) ||
      !Number.isFinite(c.priorMatches) || c.priorMatches < 0 ||
      (c.rhoPenalty !== null && (!Number.isFinite(c.rhoPenalty) || c.rhoPenalty <= 0))) throw new RangeError('Invalid football configuration.');
  if(c.mode==='legacy' && (!c.homeAdvantage || c.halfLifeDays!==null || c.priorMatches!==4 || c.rhoPenalty!==null))
    throw new RangeError('Legacy mode preserves shipped settings. Use strength mode for ablations.');
}

/** Opponent- and venue-adjusted, time-weighted rates with neutral-strength priors. */
export function fitFootball(rows: readonly History[], asOf: string, options: FootballConfig = PREVIOUS_FOOTBALL) {
  validateFootballConfig(options);
  const weighted = rows.map(row => ({ row, w: options.halfLifeDays === null ? 1 : decay((timestamp(asOf) - timestamp(row.completedAt)) / DAY, options.halfLifeDays) }));
  const sumW = weighted.reduce((s, r) => s + r.w, 0);
  let homeBase = (weighted.reduce((s, r) => s + r.w * r.row.homeScore, 0) + 20 * 1.45) / (sumW + 20);
  let awayBase = (weighted.reduce((s, r) => s + r.w * r.row.awayScore, 0) + 20 * 1.15) / (sumW + 20);
  if (!options.homeAdvantage) homeBase = awayBase = (homeBase + awayBase) / 2;
  const ids = [...new Set(rows.flatMap(r => [r.homeId, r.awayId]))].sort();
  let attack = new Map(ids.map(id => [id, 1]));
  let defence = new Map(ids.map(id => [id, 1]));
  const prior = options.priorMatches * (homeBase + awayBase) / 2;
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
  if (options.rhoPenalty === null) return {homeBase,awayBase,attack,defence,rho:0};
  let lo = -0.2, hi = 0.2;
  const likelihood = weighted.map(({ row: r, w }) => {
    const lambda = clamp(homeBase * attack.get(r.homeId)! * defence.get(r.awayId)!, 0.15, 6);
    const mu = clamp(awayBase * attack.get(r.awayId)! * defence.get(r.homeId)!, 0.15, 6);
    const bounds = dcBounds(lambda, mu); lo = Math.max(lo, bounds[0]); hi = Math.min(hi, bounds[1]);
    return { c: dcCoefficient(r.homeScore, r.awayScore, lambda, mu), w };
  });
  let rho = 0;
  for (let i = 0; i < 12; i++) {
    let gradient = -options.rhoPenalty * rho, curvature = -Number(options.rhoPenalty);
    for (const { c, w } of likelihood) {
      gradient += w * c / (1 + c * rho); curvature -= w * c * c / (1 + c * rho) ** 2;
    }
    rho = clamp(rho - gradient / curvature, lo, hi);
  }
  return { homeBase, awayBase, attack, defence, rho };
}

/** Shared runtime/benchmark path. Caller must supply eligibleHistory-filtered rows. */
export function footballForecast(input:ModelInput, rows:readonly History[], config:FootballConfig,
                                 healthLoss={home:0,away:0}) {
  validateFootballConfig(config);
  if(config.mode==='legacy') {
    const old=runFootballPoisson(input.fixture.homeId,input.fixture.awayId,rows.map(r=>({homeTeam:r.homeId,awayTeam:r.awayId,homeScore:r.homeScore,awayScore:r.awayScore})));
    const lambda=old.model.expectedHome!,mu=old.model.expectedAway!;
    return {lambda,mu,dist:scoreDistribution(lambda,mu),probabilities:old.probabilities.map(p=>p/100),fit:null,old};
  }
  const fit=fitFootball(rows,input.asOf,config),neutral=(fit.homeBase+fit.awayBase)/2;
  const ha=fit.attack.get(input.fixture.homeId)??1,aa=fit.attack.get(input.fixture.awayId)??1;
  const hd=fit.defence.get(input.fixture.homeId)??1,ad=fit.defence.get(input.fixture.awayId)??1;
  const lambda=clamp((input.fixture.neutralVenue?neutral:fit.homeBase)*ha*ad*(1-healthLoss.home)*(1+healthLoss.away/2),0.15,6);
  const mu=clamp((input.fixture.neutralVenue?neutral:fit.awayBase)*aa*hd*(1-healthLoss.away)*(1+healthLoss.home/2),0.15,6);
  const dist=scoreDistribution(lambda,mu,fit.rho);
  return {lambda,mu,dist,probabilities:[dist.home,dist.draw,dist.away],fit,old:null};
}
