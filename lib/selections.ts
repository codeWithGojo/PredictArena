import type { Match, Prediction } from "./sports.ts";

export type SlipPick = { fixtureId: string; market: string; selection: string; line: number | null; label: string; probability: number; odds: string; kickoffISO: string; home: string; away: string; league: string };
type Pick = SlipPick;

// This is a display/selection quality gate, not a calibrated accuracy claim.
export function canRecommend(match: Match): boolean {
  return match.confidence >= 62 && match.model.sampleSize >= 10 && match.probabilities.length > 0 &&
    !/LOW_SAMPLE|NO_HISTORY/.test(match.model.caveat) && ["live-api", "manual"].includes(match.source);
}

export function confidenceLabel(match: Match): string {
  if (!match.probabilities.length) return "Awaiting history";
  if (/LOW_SAMPLE/.test(match.model.caveat) || match.model.sampleSize < 10) return "Limited history";
  return match.confidence >= 75 ? "Higher confidence" : match.confidence >= 62 ? "Moderate confidence" : "Low confidence";
}

export function choices(match: Match): Pick[] {
  if (!match.probabilities.length) return [];
  return match.predictions.flatMap((prediction: Prediction) => {
    const probability = prediction.probability ?? (prediction.value.endsWith("%") ? Number(prediction.value.slice(0, -1)) / 100 : NaN);
    if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) return [];
    let market = prediction.market;
    let selection = prediction.selection;
    let line = prediction.line ?? null;
    // Legacy feeds still supply labels. Accept only known labels, never a scoreline or a heuristic.
    if (!market || !selection) {
      const label = prediction.label.toLowerCase();
      const outcome = match.sport === "football" ? ["1x2", "home", "draw", "away"] : ["winner", "home", "away"];
      if (label === `${match.home.name.toLowerCase()} win`) [market, selection] = [outcome[0], "home"];
      else if (label === `${match.away.name.toLowerCase()} win`) [market, selection] = [outcome[0], "away"];
      else if (label === "draw" && match.sport === "football") [market, selection] = ["1x2", "draw"];
      else if (match.sport === "football") {
        if (label === "home or draw") [market, selection] = ["double-chance", "home-draw"];
        else if (label === "away or draw") [market, selection] = ["double-chance", "away-draw"];
        else if (label === "both teams score") [market, selection] = ["btts", "yes"];
        else {
          const total = /^(over|under) (1\.5|2\.5|3\.5) goals$/.exec(label);
          if (total) { [market, selection] = ["total", total[1]]; line = Number(total[2]); }
        }
      }
    }
    if (!market || !selection || !["1x2", "winner", "double-chance", "total", "btts"].includes(market)) return [];
    return [{ fixtureId: match.id, market, selection, line, label: prediction.label, probability, odds: "", kickoffISO: match.kickoffISO, home: match.home.name, away: match.away.name, league: match.league }];
  });
}

export function generate(matches: Match[], count: number, minimum: number): Pick[] {
  const candidates = matches.filter((match) => canRecommend(match) && Date.parse(match.kickoffISO) > Date.now()).flatMap((match) => choices(match).filter((pick) => pick.probability * 100 >= minimum && pick.probability <= 0.85)
    .map((pick) => ({ pick, confidence: match.confidence })));
  candidates.sort((a, b) => (b.pick.probability * b.confidence) - (a.pick.probability * a.confidence) || a.pick.fixtureId.localeCompare(b.pick.fixtureId));
  const seen = new Set<string>();
  return candidates.filter(({ pick }) => { if (seen.has(pick.fixtureId)) return false; seen.add(pick.fixtureId); return true; }).slice(0, count).map(({ pick }) => pick);
}


export function headlinePick(match: Match): SlipPick | undefined {
  // Reuse the generator's bounded market pool, so cards and slips agree.
  return choices(match).filter((pick) => pick.probability >= 0.55 && pick.probability <= 0.85)
    .sort((a, b) => b.probability - a.probability)[0];
}

export function validatePicks(value: unknown, now: number): SlipPick[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((pick): pick is SlipPick => {
    if (!pick || typeof pick !== "object" || typeof pick.fixtureId !== "string" || seen.has(pick.fixtureId) ||
      typeof pick.market !== "string" || !["1x2", "winner", "double-chance", "total", "btts"].includes(pick.market) ||
      typeof pick.selection !== "string" || typeof pick.label !== "string" || typeof pick.odds !== "string" ||
      typeof pick.home !== "string" || typeof pick.away !== "string" || typeof pick.league !== "string" ||
      !(pick.line === null || (typeof pick.line === "number" && Number.isFinite(pick.line))) ||
      typeof pick.probability !== "number" || !(pick.probability > 0 && pick.probability < 1) ||
      typeof pick.kickoffISO !== "string" || !(Date.parse(pick.kickoffISO) > now)) return false;
    seen.add(pick.fixtureId);
    return true;
  }).slice(0, 20);
}
