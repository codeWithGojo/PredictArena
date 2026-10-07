import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { applyBookmakerInputs, applyBookmakerFeed, type ScreenshotBatch } from '../lib/bookmaker-inputs.ts';
import { bestOddsOption, generateForOdds, targetTotal } from '../lib/odds-slip.ts';
import { validatePicks } from '../lib/selections.ts';
import { forecastEligible, matchCalendar } from '../supabase/functions/refresh-predictions/archive.ts';
import type { Match } from '../lib/sports.ts';
const batch = JSON.parse(fs.readFileSync(new URL('../data/sportybet-screenshots-2026-10-07.json', import.meta.url), 'utf8')) as ScreenshotBatch;
const entry = batch.entries.find(e => e.bookmakerFixtureId === '31236')!;
const fixture: Match = { id: entry.providerFixtureId!, sport: 'football', leagueId: entry.leagueId, league: 'Premier League', leagueShort:'PL', date:'10 Oct', time:'15:00',
  home: {name:entry.providerHome!,short:'LIV',colors:['#000','#fff']}, away:{name:entry.providerAway!,short:'MCI',colors:['#000','#fff']}, kickoffISO: entry.originalKickoffISO!,
  probabilities:[60,25,15], predictions:[], confidence:49, model:{sampleSize:45,caveat:'',method:'Test',version:'Test',factors:[]}, source:'live-api', sourceLabel:'Provider' };

test('reviewed fixture times and actual quotes attach without rewriting history probabilities', () => {
  const corrected = applyBookmakerInputs([fixture],batch).find(m=>m.id===fixture.id)!;
  assert.equal(corrected.kickoffISO,'2026-10-11T15:30:00.000Z');
  assert.strictEqual(corrected.probabilities,fixture.probabilities);
  assert.equal(corrected.fixtureCorrection?.previousKickoffISO,fixture.kickoffISO);
  assert.deepEqual(corrected.bookmakerInput?.odds,[2.63,3.75,2.62]);
  assert.ok(Math.abs(corrected.bookmakerInput!.probabilities.reduce((a,b)=>a+b,0)-1)<1e-10);
  assert.match(matchCalendar(corrected),/DTSTART:20261011T153000Z/);
  assert.deepEqual(applyBookmakerInputs(applyBookmakerInputs([fixture],batch),batch),applyBookmakerInputs([fixture],batch));
});

test('wrong pairs, competitions, later reschedules and ambiguous observations cannot be overwritten', () => {
  for(const mismatch of [{...fixture,leagueId:'140'},{...fixture,home:fixture.away,away:fixture.home},{...fixture,kickoffISO:'2026-10-22T14:00:00Z'}]) {
    const result=applyBookmakerInputs([mismatch],batch).find(m=>m.id===fixture.id)!;
    assert.equal(result.bookmakerInput,undefined);
    assert.equal(result.kickoffISO,mismatch.kickoffISO);
  }
  assert.equal(applyBookmakerInputs([fixture],{...batch,reviewed:false})[0].bookmakerInput,undefined);
  assert.equal(applyBookmakerInputs([fixture],{...batch,entries:[entry,entry]}).find(m=>m.id===fixture.id)!.bookmakerInput,undefined);
});

test('other leagues have explicitly market-only models and missing dates are not invented', () => {
  const feed=applyBookmakerFeed({matches:[],leagueCatalog:[]},batch);
  assert.equal(feed.matches.length,17);
  assert.equal(feed.matches.filter(m=>m.bookmakerInput).length,16);
  assert.equal(feed.leagueCatalog.length,3);
  assert.ok(feed.matches.every(m=>m.model.sampleSize===0 && m.confidence===0 && !m.probabilities.length));
  assert.ok(feed.matches.every(m=>!forecastEligible(m,Date.parse('2026-10-07'))));
  assert.ok(!feed.matches.some(m=>m.home.name==='Al Nassr Club'));
  assert.equal(bestOddsOption(feed.matches.find(m=>m.home.name==='Rangers')!,55),undefined);
});

test('bookmaker generator uses captured prices and market probabilities, including market-only leagues', () => {
  const matches=applyBookmakerInputs([fixture],batch);
  const generated=generateForOdds(matches,2,55,Date.parse('2026-10-07'),'bookmaker');
  assert.ok(generated.length);
  assert.ok(Math.abs(targetTotal(generated)!/2-1)<=.05);
  assert.ok(generated.every(p=>p.probabilityBasis==='bookmaker' && p.oddsSource==='SportyBet' && Number(p.odds)>1));
  assert.deepEqual(validatePicks(JSON.parse(JSON.stringify(generated)),Date.parse('2026-10-07')),generated);
  const scottish=matches.filter(m=>m.leagueId==='179');
  assert.ok(generateForOdds(scottish,2,55,Date.parse('2026-10-07'),'bookmaker').length);
  const missing=matches.find(m=>m.home.name==='Al Hilal SFC')!;
  assert.equal(bestOddsOption(missing,45,'bookmaker'),undefined);
});

test('dataset contains one reviewed row per bookmaker ID and only full visible quote triplets', () => {
  assert.equal(batch.entries.length,133);
  assert.equal(new Set(batch.entries.map(e=>e.bookmakerFixtureId)).size,133);
  assert.equal(batch.entries.filter(e=>e.providerFixtureId).length,113);
  for(const e of batch.entries) if(e.odds) assert.ok(e.odds.length===3 && e.odds.every(o=>Number.isFinite(o)&&o>1));
  for(const id of ['31100','44980','52598','39802']) assert.equal(batch.entries.find(e=>e.bookmakerFixtureId===id)!.odds,null);
});
