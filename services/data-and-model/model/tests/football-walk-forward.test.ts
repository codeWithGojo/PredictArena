import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {replay,drawCalibration,bestIndex} from '../backtest/football/walk-forward.ts';
import type {Row} from '../backtest/football/walk-forward.ts';
import {footballForecast,fitFootball,PREVIOUS_FOOTBALL,LEGACY_FOOTBALL,validateFootballConfig} from '../football.ts';
import {DEFAULT_FOOTBALL} from '../football-default.ts';
import {SELECTED_FOOTBALL} from '../football-candidate.ts';
import {predict} from '../engine.ts';
import {baseline} from '../baseline.ts';
import {DAY} from '../math.ts';
const read=(name:string)=>readFileSync(new URL('../backtest/football/'+name,import.meta.url));
const json=(name:string)=>JSON.parse(read(name).toString());
const hash=(value:Buffer)=>createHash('sha256').update(value).digest('hex');
const source:Row[]=json('results-data.json');
const records=replay(source.filter(r=>r.season<='2019'),['2019']).records;
const input=records[100].input,pub={id:'test',generatedAt:input.asOf,isStale:false};

test('seven complete seasons per league, pinned data and unique fixture IDs',()=>{
  assert.equal(hash(read('results-data.json')),json('provenance.json').datasetSha256);
  assert.equal(source.length,5320);assert.equal(new Set(source.map(r=>r.id)).size,source.length);
  for(const league of ['premier-league','la-liga'])for(let year=2018;year<=2024;year++)assert.equal(source.filter(r=>r.league===league&&r.season===String(year)).length,380);
  assert.ok(source.every(r=>Object.keys(r).sort().join(',')==='away,awayScore,closingOdds,date,home,homeScore,id,league,season'));
  assert.ok(source.every(r=>r.closingOdds===null||(Array.isArray(r.closingOdds)&&r.closingOdds.length===3&&r.closingOdds.every(odds=>odds>1))));
});
test('walk-forward excludes target, same-day, future and other-league results and respects bounds',()=>{
  assert.equal(records.length,760);
  for(const {input} of records){assert.ok(input.history.length>=50&&input.history.length<=200);
    assert.ok(input.history.every(r=>r.fixtureId!==input.fixture.id&&r.competitionId===input.fixture.competitionId&&r.observedAt<=input.asOf&&Date.parse(r.startsAt)>=Date.parse(input.asOf)-365*DAY));}
  const target=records[100].date;
  const changed=source.filter(r=>r.season<='2019').map(r=>r.date>=target?{...r,homeScore:9,awayScore:0}:r);
  assert.deepEqual(records.filter(r=>r.date<=target).map(r=>r.input),replay(changed,['2019']).records.filter(r=>r.date<=target).map(r=>r.input));
});
test('future test outcomes cannot affect earlier development features',()=>{
  const changed=source.map(r=>Number(r.season)>=2023?{...r,homeScore:99,awayScore:0}:r);
  assert.deepEqual(replay(source,['2019']).records,replay(changed,['2019']).records);
});
test('runtime and backtest use identical football probabilities under explicit configurations',()=>{
  for(const config of [DEFAULT_FOOTBALL,SELECTED_FOOTBALL,PREVIOUS_FOOTBALL,LEGACY_FOOTBALL,
    {...PREVIOUS_FOOTBALL,homeAdvantage:false,halfLifeDays:null,priorMatches:0,rhoPenalty:null}]){
    const expected=footballForecast(input,input.history,config).probabilities;
    const p=predict(input,pub,{football:config}).summary.winProbability!;
    assert.deepEqual([p.home,p.draw,p.away],expected);
    if(config.mode==='legacy')assert.deepEqual(expected,baseline(input)!.probabilities.map(p=>p/100));
  }
});
test('health and injuries do not alter defaults; explicit adjustments are labelled experimental',()=>{
  const rich={...input,injuries:[{participantId:input.fixture.homeId,athleteId:'p',status:'out' as const,observedAt:input.asOf,source:'test'}],
    teamHealth:[{participantId:input.fixture.homeId,availabilityScore:0,restDays:0,observedAt:input.asOf,source:'test'}]};
  assert.deepEqual(predict(rich,pub),predict(input,pub));
  const adjusted=predict(rich,pub,{football:PREVIOUS_FOOTBALL,experimentalFootballHealth:true});
  assert.ok(adjusted.analysis.warnings.includes('EXPERIMENTAL_HEALTH_ADJUSTMENT'));
  assert.ok(adjusted.summary.expectedScore!.home<predict(input,pub,{football:PREVIOUS_FOOTBALL}).summary.expectedScore!.home);
});
test('disabled home, decay, DC and shrinkage really are disabled',()=>{
  const config={...PREVIOUS_FOOTBALL,halfLifeDays:null,rhoPenalty:null,homeAdvantage:false,priorMatches:0};
  const fit=fitFootball(input.history,input.asOf,config);
  assert.deepEqual(fit,fitFootball(input.history,new Date(Date.parse(input.asOf)+DAY).toISOString(),config));
  assert.equal(fit.rho,0);assert.equal(fit.homeBase,fit.awayBase);
  const flags=predict(input,pub,{football:config}).analysis.featuresUsed;
  for(const flag of ['timeDecay','dixonColes','homeAdvantage','shrinkage'])assert.ok(!flags.includes(flag));
});
test('invalid settings and mixed legacy configurations are rejected',()=>{
  for(const config of [{...PREVIOUS_FOOTBALL,halfLifeDays:0},{...PREVIOUS_FOOTBALL,rhoPenalty:-1},{...PREVIOUS_FOOTBALL,priorMatches:NaN},{...LEGACY_FOOTBALL,halfLifeDays:90}])assert.throws(()=>validateFootballConfig(config));
});
test('draw calibration uses fixed bins, observed frequencies, empty bins and proper binary Brier',()=>{
  const c=drawCalibration([{draw:0,isDraw:0},{draw:0.1,isDraw:1},{draw:0.19,isDraw:0},{draw:1,isDraw:1}]);
  assert.equal(c.bins[0].n,1);assert.equal(c.bins[1].n,2);assert.equal(c.bins[9].n,1);assert.equal(c.bins[1].observed,0.5);
  assert.equal(c.bins[2].predicted,null);assert.equal(c.observed,0.5);assert.ok(Math.abs(c.drawBrier-(0.81+0.0361)/4)<1e-12);
});
test('frozen candidate matches earlier-only deterministic selection and release fallback keeps legacy',()=>{
  const p=json('protocol.json'),s=json('selection.json'),t=json('test-results.json'),d=json('default-decision.json');
  assert.ok(Math.max(...p.tuningSeasons.map(Number))<Math.min(...p.selectionSeasons.map(Number)));
  assert.ok(Math.max(...p.selectionSeasons.map(Number))<Math.min(...p.testSeasons.map(Number)));
  const winner=s.candidates[bestIndex(s.candidates.map((c:any)=>c.results.pooled.logLoss))];
  assert.deepEqual(winner.config,SELECTED_FOOTBALL);assert.deepEqual(s.winner.config,SELECTED_FOOTBALL);
  for(const c of s.candidates)assert.ok(c.results.bySeason.every((r:any)=>p.selectionSeasons.includes(r.season)));
  assert.equal(bestIndex([1,1,1.1]),0);assert.throws(()=>bestIndex([NaN]));
  assert.equal(d.testSha256,hash(read('test-results.json')));assert.equal(t.selectionSha256,hash(read('selection.json')));
  assert.equal(d.selectionSha256,hash(read('selection.json')));assert.deepEqual(d.defaultConfig,DEFAULT_FOOTBALL);
  assert.ok(d.candidateLogLoss>=d.oldLogLoss);assert.deepEqual(DEFAULT_FOOTBALL,LEGACY_FOOTBALL);
  for(const {input} of records.slice(0,20)){const p=predict(input,{id:'test',generatedAt:input.asOf,isStale:false}).summary.winProbability!;
    assert.deepEqual([p.home,p.draw,p.away],baseline(input)!.probabilities.map(p=>p/100));}
});
