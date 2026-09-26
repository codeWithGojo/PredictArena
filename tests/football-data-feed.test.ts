import assert from "node:assert/strict";
import test from "node:test";
import { footballDataToFixture, type FootballDataMatch } from "../lib/football-data.ts";

const league = { id: "78", name: "Bundesliga" };
const match: FootballDataMatch = { id: 1234, utcDate: "2026-10-03T14:30:00Z", status: "TIMED",
  venue: "Allianz Arena", season: { startDate: "2026-08-21" },
  homeTeam: { id: 5, name: "FC Bayern München", crest: "https://crests.football-data.org/5.png" },
  awayTeam: { id: 6, name: "Borussia Dortmund" },
  score: { fullTime: { home: null, away: null } } };

test("maps football-data.org upcoming fixture, stable teams and season", () => {
  const result = footballDataToFixture(match, league);
  assert.equal(result?.fixture.id, 1234);
  assert.equal(result?.fixture.status.short, "NS");
  assert.equal(result?.teams.home.name, "FC Bayern München");
  assert.equal(result?.league.season, 2026);
  assert.equal(result?.goals.home, null);
});

test("accepts final score only for valid finished match", () => {
  const result = footballDataToFixture({ ...match, status: "FINISHED",
    score: { fullTime: { home: 2, away: 1 } } }, league);
  assert.equal(result?.fixture.status.short, "FT");
  assert.deepEqual(result?.goals, { home: 2, away: 1 });
  const withoutScore = footballDataToFixture({ ...match, status: "FINISHED" }, league);
  assert.notEqual(withoutScore?.fixture.status.short, "FT");
  assert.equal(withoutScore?.goals.home, null);
});
