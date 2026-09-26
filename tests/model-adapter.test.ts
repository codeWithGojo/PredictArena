import assert from "node:assert/strict";
import test from "node:test";
import { historyFromCompleted, modelForFixture, type CompletedFixture } from "../lib/model-adapter.ts";

const now = new Date("2026-09-26T12:00:00.000Z");
const fixture = { id: "manual-test-1", sport: "football" as const, competitionId: "football:premier-league",
  season: "2026", startsAt: "2026-09-28T19:00:00.000Z", home: "Arsenal", away: "Chelsea" };
const completed: CompletedFixture[] = Array.from({ length: 12 }, (_, i) => ({
  id: `historical-${i}`, startsAt: new Date(Date.parse("2026-08-01T15:00:00.000Z") + i * 4 * 86_400_000).toISOString(),
  home: i % 2 ? "Arsenal" : "Chelsea", away: i % 2 ? "Chelsea" : "Arsenal",
  homeScore: i % 3, awayScore: (i + 1) % 3, status: "finished",
}));

test("publishes a normalized, versioned football prediction from completed history", () => {
  const result = modelForFixture(fixture, completed, now);
  assert.equal(result.probabilities.length, 3);
  assert.equal(result.probabilities.reduce((a, b) => a + b, 0), 100);
  assert.equal(result.model.version, "PA-Poisson 1.2 adapter 2.1");
  assert.equal(result.model.sampleSize, 12);
});

test("never invents probabilities without eligible results", () => {
  const result = modelForFixture(fixture, [], now);
  assert.deepEqual(result.probabilities, []);
  assert.equal(result.confidence, 0);
  assert.match(result.model.caveat, /NO_HISTORY/);
});

test("excludes incomplete or not-yet-available results", () => {
  const recent: CompletedFixture = { id: "today", startsAt: "2026-09-26T10:00:00.000Z", home: "Arsenal", away: "Chelsea",
    homeScore: 1, awayScore: 0, status: "finished" };
  const rows = historyFromCompleted([recent, ...completed], fixture.competitionId, fixture.sport, now.toISOString());
  assert.equal(rows.length, 12);
  assert.ok(rows.every((row) => row.observedAt <= now.toISOString()));
});

test("runs the upgraded basketball model and rejects past kickoffs", () => {
  const basketball = { ...fixture, id: "nba-1", sport: "basketball" as const, competitionId: "basketball:nba",
    home: "Atlanta Hawks", away: "Memphis Grizzlies" };
  const history = completed.map((event) => ({ ...event, home: "Atlanta Hawks", away: "Memphis Grizzlies",
    homeScore: 100 + event.homeScore, awayScore: 95 + event.awayScore }));
  const result = modelForFixture(basketball, history, now);
  assert.equal(result.model.version, "PA-Margin 2.0");
  assert.equal(result.probabilities.length, 2);
  assert.throws(() => modelForFixture({ ...fixture, startsAt: "2026-09-25T12:00:00.000Z" }, completed, now), /future kickoff/);
});

test("runs the tennis v2 engine only on valid completed set scores", () => {
  const tennis = { ...fixture, id: "atp-1", sport: "tennis" as const, competitionId: "tennis:atp",
    home: "Player One", away: "Player Two" };
  const history = completed.map((event, i) => ({ ...event, home: "Player One", away: "Player Two",
    homeScore: i % 2 ? 2 : 1, awayScore: i % 2 ? 1 : 2 }));
  const result = modelForFixture(tennis, history, now);
  assert.equal(result.model.version, "PA-Tennis 2.0");
  assert.equal(result.probabilities.reduce((a, b) => a + b, 0), 100);
  assert.equal(result.model.expectedTotal, undefined);
});
