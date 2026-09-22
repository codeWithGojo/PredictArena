import type { ModelInput } from './types.ts';
import { eligibleHistory } from './input.ts';
import { runFootballPoisson, runBasketballMarginModel, runTennisFormModel } from './legacy.ts';

/** Actual shipped model, including integer percentage rounding, on the same bounded input. */
export function baseline(input: ModelInput) {
  const rows = eligibleHistory(input);
  if (!rows.length) return null;
  const fn = { football:runFootballPoisson, basketball:runBasketballMarginModel, tennis:runTennisFormModel }[input.fixture.sport];
  return fn(input.fixture.homeId,input.fixture.awayId, rows.map(r => ({
    homeTeam:r.homeId,awayTeam:r.awayId,homeScore:r.homeScore,awayScore:r.awayScore,
  })));
}
