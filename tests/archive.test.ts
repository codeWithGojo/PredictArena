import test from "node:test";
import assert from "node:assert/strict";
import { forecastEligible, scoreForecast, forecastOutcome, matchCalendar } from "../lib/archive.ts";
test("scores wins, draws and losses with the full probability distribution", () => {
 assert.deepEqual(scoreForecast([100,0,0],2,0),{correct:true,brier:0,logLoss:-0});
 const miss = scoreForecast([70,20,10],0,1); assert.equal(miss.correct,false); assert.ok(Math.abs(miss.brier - 1.34) < 1e-9); assert.ok(Math.abs(miss.logLoss - Math.log(10)) < 1e-9);
 assert.equal(scoreForecast([20,60,20],1,1).correct,true);
 assert.equal(forecastOutcome([40,40,20]),"home");
 assert.throws(() => scoreForecast([70,20,20],1,0));
});
test("only future provider-backed football with sufficient history can enter archive", () => {
 const now = Date.parse("2026-10-07T06:00:00Z");
 const m = {sport:"football",source:"live-api",kickoffISO:"2026-10-08T15:00:00Z",probabilities:[50,25,25],model:{sampleSize:10}};
 assert.equal(forecastEligible(m,now),true);
 for (const change of [{source:"manual"},{sport:"basketball"},{kickoffISO:"2026-10-06T15:00:00Z"},{probabilities:[120,-20,0]},{model:{sampleSize:9}},{probabilities:[NaN,30,70]}]) assert.equal(forecastEligible({...m,...change},now),false);
});
test("calendar stores a UTC kickoff and reminder, escaping injected new lines", () => {
 const ics = matchCalendar({id:"fixture-1",home:{name:"A\nBEGIN:VEVENT"},away:{name:"B, C"},league:"PL",kickoffISO:"2026-10-10T15:00:00Z"},new Date("2026-10-07T06:00:00Z"));
 assert.match(ics,/DTSTART:20261010T150000Z/); assert.match(ics,/TRIGGER:-PT30M/); assert.match(ics,/A\\nBEGIN:VEVENT/); assert.equal(ics.split("\r\nBEGIN:VEVENT").length,2);
});
