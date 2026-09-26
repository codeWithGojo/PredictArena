import assert from "node:assert/strict";
import test from "node:test";
import { openEventToFixture, type OpenEvent } from "../lib/open-football.ts";

const league = { id: "39", name: "Premier League" };
const event: OpenEvent = {
  id: "401882867", date: "2026-09-28T19:00:00Z", season: { year: 2026 },
  status: { type: { state: "pre", completed: false } },
  competitions: [{ venue: { fullName: "Emirates Stadium" }, competitors: [
    { homeAway: "home", score: null, team: { name: "Arsenal", logo: "https://example.com/arsenal.png" } },
    { homeAway: "away", score: null, team: { displayName: "Chelsea" } },
  ] }],
};

test("maps documented event shape into an upcoming fixture with provider ID", () => {
  const fixture = openEventToFixture(event, league);
  assert.equal(fixture?.fixture?.id, "401882867");
  assert.equal(fixture?.fixture?.status?.short, "NS");
  assert.equal(fixture?.fixture?.venue?.name, "Emirates Stadium");
  assert.equal(fixture?.teams?.away?.name, "Chelsea");
  assert.equal(fixture?.goals?.home, null);
});

test("accepts only completed results with numeric final scores as model history", () => {
  const completed = openEventToFixture({ ...event, status: { type: { state: "post", completed: true } },
    competitions: [{ competitors: [
      { homeAway: "home", score: "2", team: { name: "Arsenal" } },
      { homeAway: "away", score: "1", team: { name: "Chelsea" } },
    ] }] }, league);
  assert.equal(completed?.fixture?.status?.short, "FT");
  assert.deepEqual(completed?.goals, { home: 2, away: 1 });
  const unverified = openEventToFixture({ ...event, status: { type: { state: "post", completed: false } } }, league);
  assert.notEqual(unverified?.fixture?.status?.short, "FT");
  assert.equal(unverified?.goals?.home, null);
});
