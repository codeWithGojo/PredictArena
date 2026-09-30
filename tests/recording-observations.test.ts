import assert from 'node:assert/strict';
import test from 'node:test';
import {attachRecordingContext, marketProbabilities, type RecordingBatch} from '../lib/recording-observations.ts';
import type {Match} from '../lib/sports.ts';
const batch: RecordingBatch = {source:'Recording',sourceFile:'test.mp4',recordedDate:'2026-09-30',observedAt:null,reviewed:true,notes:[],entries:[{leagueId:'39',home:'Arsenal',away:'Leeds United',fixtureDate:'2026-10-10',bookmaker:'Test',odds:[1.35,4.95,8.6],goalsLastFive:{home:14,away:null}}]};
const fixture = {sport:'football',leagueId:'39',home:{name:'Arsenal'},away:{name:'Leeds'},kickoffISO:'2026-10-10T11:30:00.000Z',probabilities:[60,25,15]} as Match;
test('matches aliases and keeps model probabilities unchanged',()=>{
 const result=attachRecordingContext(fixture,batch,new Date('2026-09-30T09:00:00Z'));
 assert.equal(result.recordingContext?.goalsLastFive.home,14);
 assert.equal(result.recordingContext?.goalsLastFive.away,null);
 assert.equal(result.recordingContext?.stale,false);
 assert.strictEqual(result.probabilities,fixture.probabilities);
 assert.ok(Math.abs(result.recordingContext!.marketProbabilities.reduce((a,b)=>a+b,0)-1)<1e-12);
});
test('rejects wrong dates, competitions, reversed sides and ambiguous observations',()=>{
 for(const mismatch of [{...fixture,kickoffISO:'2026-10-11T11:30:00.000Z'},{...fixture,leagueId:'140'},{...fixture,home:fixture.away,away:fixture.home}]) assert.equal(attachRecordingContext(mismatch,batch).recordingContext,undefined);
 assert.equal(attachRecordingContext(fixture,{...batch,entries:[...batch.entries,...batch.entries]}).recordingContext,undefined);
 assert.equal(attachRecordingContext(fixture,{...batch,reviewed:false}).recordingContext,undefined);
});
test('marks old observations and rejects malformed odds',()=>{
 assert.equal(attachRecordingContext(fixture,batch,new Date('2026-10-01T00:00:00Z')).recordingContext?.stale,true);
 for(const odds of [[1,2,3],[2,3],[NaN,2,3]]) assert.throws(()=>marketProbabilities(odds));
});
