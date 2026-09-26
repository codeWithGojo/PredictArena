import assert from "node:assert/strict";
import test from "node:test";
import { matchweekLabel, matchweekStart } from "../lib/matchweeks.ts";

test("uses Lagos Monday to Sunday even when UTC is still Sunday", () => {
  assert.equal(matchweekStart("2026-09-27T23:30:00.000Z"), "2026-09-28");
  assert.equal(matchweekStart("2026-09-27T22:30:00.000Z"), "2026-09-21");
  assert.equal(matchweekLabel("2026-09-28"), "28 Sept – 4 Oct");
});
