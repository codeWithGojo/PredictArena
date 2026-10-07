import test from "node:test";
import assert from "node:assert/strict";
import { archiveResolver, newForecasts } from "../supabase/functions/refresh-predictions/reconciliation.ts";
const original = { fixture_id: "api-1", league_id: "39", home: "A", away: "B", kickoff_at: "2026-10-10T15:00:00Z" };
test("provider changes and reschedules retain the first forecast identity", () => {
 const resolve = archiveResolver([original]);
 assert.equal(resolve({...original, fixture_id:"other-provider-1", kickoff_at:"2026-10-10T16:00:00+01:00"}),"api-1");
 assert.equal(resolve({...original, kickoff_at:"2026-11-12T15:00:00Z"}),"api-1");
 assert.equal(resolve({...original, home:"C", kickoff_at:"2026-11-12T15:00:00Z"}),undefined);
});
test("refresh retries and duplicate provider fixtures cannot replace archive rows", () => {
 const fresh = {...original,fixture_id:"api-2",home:"C"};
 const candidates = [original,{...original,kickoff_at:"2026-11-12T15:00:00Z"},{...original,fixture_id:"other-provider-1"},fresh,{...fresh,fixture_id:"other-provider-2"}];
 assert.deepEqual(newForecasts(candidates,[original]),[fresh]);
});
