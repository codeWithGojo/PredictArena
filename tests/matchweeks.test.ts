import assert from "node:assert/strict";
import test from "node:test";
import { inMatchweek, matchweekLabel, matchweekStart, relativeMatchweekStart } from "../lib/matchweeks.ts";

test("uses Lagos Monday to Sunday even when UTC is still Sunday", () => {
  assert.equal(matchweekStart("2026-09-27T23:30:00.000Z"), "2026-09-28");
  assert.equal(matchweekStart("2026-09-27T22:30:00.000Z"), "2026-09-21");
  assert.equal(matchweekLabel("2026-09-28"), "28 Sept – 4 Oct");
});

test('this week stays within Lagos Monday–Sunday and next week is an explicit different window', () => {
  const now=Date.parse('2026-10-07T17:23:49Z');
  assert.equal(relativeMatchweekStart(now),'2026-10-05');
  assert.equal(relativeMatchweekStart(now,1),'2026-10-12');
  assert.equal(inMatchweek('2026-10-11T22:59:59Z','this',now),true);
  assert.equal(inMatchweek('2026-10-11T23:00:00Z','this',now),false);
  assert.equal(inMatchweek('2026-10-11T23:00:00Z','next',now),true);
  assert.equal(inMatchweek('2026-10-18T23:00:00Z','next',now),false);
  assert.equal(inMatchweek('2026-10-19T15:00:00Z','all',now),true);
});
