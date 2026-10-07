import type { Match } from "./sports.ts";
import { choices, type SlipPick } from "./selections.ts";

export const MAX_TARGET_ODDS = 10_000;
export function estimatedOdds(pick: SlipPick): number {
  return Math.round(100 / pick.probability) / 100;
}
export function estimatedTotal(picks: SlipPick[]): number | null {
  return picks.length ? picks.reduce((total, pick) => total * estimatedOdds(pick), 1) : null;
}

// Confidence describes model coverage, not a calibrated chance of winning.
// Use it to rank games; require real history rather than an arbitrary score.
export function bestOddsOption(match: Match, minimum: number): SlipPick | undefined {
  if (!Number.isFinite(minimum) || minimum <= 0 || minimum >= 100 ||
    !Number.isFinite(match.confidence) || match.confidence <= 0 ||
    !Number.isFinite(match.model.sampleSize) || match.model.sampleSize < 10 ||
    /LOW_SAMPLE|NO_HISTORY/.test(match.model.caveat) ||
    !["live-api", "manual"].includes(match.source)) return undefined;
  return choices(match).filter((pick) => pick.probability * 100 >= minimum && estimatedOdds(pick) > 1)
    .sort((a, b) => b.probability - a.probability || `${a.market}:${a.selection}:${a.line}`.localeCompare(`${b.market}:${b.selection}:${b.line}`))[0];
}

type State = { logOdds: number; quality: number; picks: SlipPick[] };

// Bounded log-space search: retain a high-confidence combination in each odds
// bucket. Lock each game to its strongest eligible market before combining it.
// This finds a close suggestion, not a guaranteed global optimum.
export function generateForOdds(matches: Match[], target: number, minimum: number, now = Date.now()): SlipPick[] {
  if (!Number.isFinite(target) || target <= 1 || target > MAX_TARGET_ODDS || !Number.isFinite(minimum)) return [];
  const groups = matches.filter((match) => Date.parse(match.kickoffISO) > now)
    .sort((a, b) => a.id.localeCompare(b.id))
    .filter((match, index, all) => index === 0 || match.id !== all[index - 1].id)
    .map((match) => {
      const best = bestOddsOption(match, minimum);
      // Longer histories improve ranking, without inflating probabilities.
      const coverage = Math.min(1, match.model.sampleSize / 50);
      return { confidence: Math.min(100, match.confidence) * (.75 + .25 * coverage), picks: best ? [best] : [] };
    })
    .filter((group) => group.picks.length);
  if (!groups.length) return [];
  const goal = Math.log(target);
  const largestLeg = Math.max(...groups.flatMap((group) => group.picks.map((pick) => Math.log(estimatedOdds(pick)))));
  const limit = goal + largestLeg;
  const width = goal / 1024;
  let states = new Map<number, State>([[0, { logOdds: 0, quality: 0, picks: [] }]]);
  let closest: State | undefined;
  const consider = (candidate: State) => {
    const distance = Math.abs(candidate.logOdds - goal);
    const previous = closest ? Math.abs(closest.logOdds - goal) : Infinity;
    const nearTarget = Math.abs(Math.exp(candidate.logOdds) / target - 1) <= .05;
    const previousNear = closest ? Math.abs(Math.exp(closest.logOdds) / target - 1) <= .05 : false;
    if ((nearTarget && !previousNear) ||
      (nearTarget && previousNear && (candidate.quality > closest!.quality + 1e-10 ||
        (Math.abs(candidate.quality - closest!.quality) <= 1e-10 && distance < previous))) ||
      (!nearTarget && !previousNear && (distance < previous - 1e-10 ||
        (Math.abs(distance - previous) <= 1e-10 && candidate.quality > (closest?.quality ?? -Infinity))))) closest = candidate;
  };
  for (const group of groups) {
    const next = new Map(states);
    for (const state of states.values()) {
      if (state.picks.length >= 20) continue;
      for (const pick of group.picks) {
        const logOdds = state.logOdds + Math.log(estimatedOdds(pick));
        if (logOdds > limit) continue;
        const candidate = { logOdds, quality: state.quality + Math.log(Math.min(100, group.confidence) / 100), picks: [...state.picks, pick] };
        consider(candidate);
        // Once above the target, another leg can only increase the distance.
        if (logOdds > goal) continue;
        const bucket = Math.round(logOdds / width);
        const existing = next.get(bucket);
        if (!existing || candidate.quality > existing.quality || (candidate.quality === existing.quality && candidate.picks.length < existing.picks.length)) next.set(bucket, candidate);
      }
    }
    states = next;
  }
  return closest?.picks ?? [];
}
