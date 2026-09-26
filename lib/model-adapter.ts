import { predict } from "../services/data-and-model/model/engine.ts";
import type { History, ModelInput, Sport } from "../services/data-and-model/model/types.ts";
import type { FootballModelResult } from "./sports";

export type CompletedFixture = {
  id: string;
  startsAt: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  status: "finished";
};

export type PredictionFixture = {
  id: string;
  sport: Sport;
  competitionId: string;
  season: string;
  startsAt: string;
  home: string;
  away: string;
};

// These providers expose kickoff and final score, but not the time at which the
// result became visible. The next UTC midnight is a conservative availability
// cutoff; it is an assumption, not a claimed provider observation timestamp.
export function historyFromCompleted(fixtures: CompletedFixture[], competitionId: string, sport: Sport, asOf: string): History[] {
  const cutoff = Date.parse(asOf);
  return fixtures.flatMap((fixture) => {
    const start = Date.parse(fixture.startsAt);
    const completed = start + 4 * 60 * 60 * 1000;
    const observed = Math.max(completed, Math.ceil((start + 1) / 86_400_000) * 86_400_000);
    if (!Number.isFinite(start) || observed > cutoff ||
      !Number.isSafeInteger(fixture.homeScore) || !Number.isSafeInteger(fixture.awayScore) ||
      fixture.homeScore < 0 || fixture.awayScore < 0) return [];
    return [{ fixtureId: fixture.id, competitionId, homeId: participantId(fixture.home), awayId: participantId(fixture.away),
      startsAt: new Date(start).toISOString(), completedAt: new Date(completed).toISOString(),
      observedAt: new Date(observed).toISOString(), homeScore: fixture.homeScore, awayScore: fixture.awayScore,
      unit: { football: "goals", basketball: "points", tennis: "sets" }[sport] as History["unit"] }];
  });
}

export function participantId(name: string) {
  return name.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

function percentages(values: number[]): number[] {
  const rounded = values.map((value) => Math.round(value * 100));
  if (rounded.length) rounded[rounded.indexOf(Math.max(...rounded))] += 100 - rounded.reduce((sum, value) => sum + value, 0);
  return rounded;
}

export function modelForFixture(fixture: PredictionFixture, completed: CompletedFixture[], now = new Date()): FootballModelResult {
  const kickoff = Date.parse(fixture.startsAt);
  if (!Number.isFinite(kickoff) || kickoff <= now.getTime()) throw new TypeError("A prediction requires a future kickoff.");
  const asOf = new Date(now.getTime()).toISOString();
  const input: ModelInput = { schemaVersion: 1,
    fixture: { id: fixture.id, sport: fixture.sport, competitionId: fixture.competitionId, season: fixture.season,
      startsAt: new Date(kickoff).toISOString(), homeId: participantId(fixture.home), awayId: participantId(fixture.away), neutralVenue: false },
    asOf, history: historyFromCompleted(completed, fixture.competitionId, fixture.sport, asOf) };
  const output = predict(input, { id: `prediction:${fixture.id}:${asOf}`, generatedAt: asOf, isStale: false });
  const { summary, analysis } = output;
  const probabilities = summary.winProbability
    ? percentages([summary.winProbability.home, ...(summary.winProbability.draw === null ? [] : [summary.winProbability.draw]), summary.winProbability.away])
    : [];
  const labels = fixture.sport === "football" ? [`${fixture.home} win`, "Draw", `${fixture.away} win`] : [`${fixture.home} win`, `${fixture.away} win`];
  const strongest = probabilities.indexOf(Math.max(...probabilities));
  const outcomes = probabilities.map((value, index) => ({ label: labels[index], value: `${value}%`, featured: index === strongest,
    explanation: "Pre-match model outcome probability." }));
  const extra = analysis.markets.filter((market) => !["1x2", "winner"].includes(market.market)).map((market) => ({
    label: `${market.market.replace(/-/g, " ")} ${market.selection}`,
    value: `${Math.round(market.probability * 100)}%`, explanation: market.explanation,
  }));
  return { probabilities, predictions: [...outcomes, ...extra], confidence: Math.round((summary.confidence ?? 0) * 100),
    model: { method: analysis.method, version: summary.modelVersion,
      expectedHome: summary.expectedScore?.home, expectedAway: summary.expectedScore?.away,
      expectedTotal: summary.expectedScore?.total, sampleSize: analysis.sampleSize,
      topScoreline: analysis.topScoreline ? `${analysis.topScoreline.home}–${analysis.topScoreline.away}` : undefined,
      factors: analysis.factors.map((factor) => ({ ...factor, strength: Math.round(factor.strength * 100) })),
      scoreMatrix: analysis.scoreMatrix.map((cell) => ({ ...cell, probability: Math.round(cell.probability * 1000) / 10 })),
      caveat: analysis.warnings.length ? `${analysis.caveat} ${analysis.warnings.join(", ")}.` : analysis.caveat } };
}
