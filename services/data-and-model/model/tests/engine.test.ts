import {test} from 'node:test';
import assert from 'node:assert/strict';
import {predict,fitFootball} from '../engine.ts';
import {eligibleHistory} from '../input.ts';
import {PREVIOUS_FOOTBALL} from '../football.ts';
import {baseline} from '../baseline.ts';
import type {History,ModelInput,Sport} from '../types.ts';
import {DAY} from '../math.ts';

const asOf='2024-06-01T00:00:00.000Z', startsAt='2024-06-02T00:00:00.000Z';
const pub={id:'test-prediction',generatedAt:asOf,isStale:false};
const iso=(ms:number)=>new Date(ms).toISOString();
const close=(a:number,b:number,tolerance=1e-9)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
function input(sport:Sport='football'):ModelInput {
  const competitionId={football:'football:premier-league',basketball:'basketball:nba',tennis:'tennis:atp'}[sport];
  const unit={football:'goals',basketball:'points',tennis:'sets'}[sport] as History['unit'];
  const history:History[]=Array.from({length:20},(_,i)=>{
    const time=Date.parse(asOf)-(22-i)*DAY;
    return {fixtureId:'past-'+i,competitionId,homeId:i%2?'A':'B',awayId:i%2?'B':'A',startsAt:iso(time),completedAt:iso(time+2*3_600_000),observedAt:iso(time+3*3_600_000),
      homeScore:sport==='basketball'?110:2,awayScore:sport==='basketball'?105:1,unit,surface:i%2?'clay':'hard'};
  });
  return {schemaVersion:1,fixture:{id:'target',sport,competitionId,season:'2024',startsAt,homeId:'A',awayId:'B',neutralVenue:false},asOf,history};
}
function freeze(value:unknown){if(value&&typeof value==='object'){Object.freeze(value);for(const v of Object.values(value))freeze(v);}}

for(const sport of ['football','basketball','tennis'] as Sport[]) {
  test(`${sport}: contract shape, numeric probabilities, finite confidence and expected scores`,()=>{
    const p=predict(input(sport),pub),s=p.summary,a=p.analysis;
    assert.deepEqual(Object.keys(p).sort(),['analysis','summary']);
    assert.deepEqual(Object.keys(s).sort(),['availability','confidence','dataCutoffAt','expectedScore','fixtureId','generatedAt','id','isStale','modelVersion','sport','winProbability']);
    assert.deepEqual(Object.keys(a).sort(),['caveat','factors','featuresUsed','markets','method','participantSampleSize','projectedMargin','sampleSize','scoreMatrix','topScoreline','warnings']);
    assert.equal(s.availability,'ready');assert.ok(s.confidence!>=0&&s.confidence!<=1);
    const w=s.winProbability!;close(w.home+(w.draw??0)+w.away,1);
    assert.ok([w.home,w.away,...(w.draw===null?[]:[w.draw])].every(x=>x>=0&&x<=1));
    if(sport==='tennis'){assert.equal(s.expectedScore,null);assert.equal(w.draw,null);}
    else {close(s.expectedScore!.home+s.expectedScore!.away,s.expectedScore!.total);assert.ok(s.expectedScore!.away>=0);}
    if(sport==='football'){assert.equal(a.scoreMatrix.length,25);assert.ok(a.scoreMatrix.reduce((s,c)=>s+c.probability,0)<1);assert.ok(a.topScoreline);}
    else {assert.deepEqual(a.scoreMatrix,[]);assert.equal(a.topScoreline,null);}
    if(sport==='basketball')close(s.expectedScore!.home-s.expectedScore!.away,a.projectedMargin!);
    assert.ok(a.factors.every(f=>f.strength>=0&&f.strength<=1));
    assert.ok(a.markets.every(m=>m.probability>=0&&m.probability<=1&&m.kind==='probability'));
  });
  test(`${sport}: deterministic with frozen caller data and reordered history`,()=>{
    const i=input(sport);freeze(i);const first=predict(i,pub);
    assert.deepEqual(first,predict(i,pub));assert.deepEqual(first,predict({...i,history:[...i.history].reverse()},pub));
  });
  test(`${sport}: zero eligible history yields no estimates`,()=>{
    const i=input(sport);i.history=[];const p=predict(i,pub);
    assert.equal(p.summary.availability,'insufficient_data');assert.equal(p.summary.winProbability,null);assert.equal(p.summary.confidence,null);assert.equal(p.summary.expectedScore,null);
    assert.deepEqual(p.analysis.warnings,['NO_HISTORY']);assert.deepEqual(p.analysis.markets,[]);assert.deepEqual(p.analysis.factors,[]);assert.deepEqual(p.analysis.featuresUsed,[]);
  });
}
test('future observations, target results, invalid scores and other competitions do not change predictions',()=>{
  const i=input(), original=predict(i,pub), r=i.history[0];
  const bad=[{...r,fixtureId:'target'},{...r,fixtureId:'future',observedAt:startsAt},{...r,fixtureId:'other',competitionId:'football:serie-a'},
    {...r,fixtureId:'nan',homeScore:NaN},{...r,fixtureId:'negative',awayScore:-1},{...r,fixtureId:'fraction',homeScore:1.5},
    {...r,fixtureId:'bad-date',startsAt:'2024-02-30T00:00:00.000Z'},{...r,fixtureId:'unfinished',completedAt:startsAt},
    {...r,fixtureId:'wrong-unit',unit:'sets' as const},{...r,fixtureId:'bad-order',completedAt:r.startsAt}];
  assert.deepEqual(predict({...i,history:[...i.history,...bad]},pub),original);
});
test('historical revision selection uses latest observable version, with deterministic conflicting duplicates',()=>{
  const i=input(),r=i.history[0];
  const revised={...r,homeScore:3,observedAt:asOf};
  let selected=eligibleHistory({...i,history:[...i.history,revised]});assert.equal(selected.find(v=>v.fixtureId===r.fixtureId)!.homeScore,3);
  selected=eligibleHistory({...i,history:[...i.history,{...revised,observedAt:startsAt}]});assert.equal(selected.find(v=>v.fixtureId===r.fixtureId)!.homeScore,r.homeScore);
  const conflict={...r,homeScore:3};
  assert.equal(eligibleHistory({...i,history:[...i.history,conflict]}).length,19);
  assert.deepEqual(eligibleHistory({...i,history:[...i.history,conflict]}),eligibleHistory({...i,history:[conflict,...i.history]}));
});
test('history is capped at latest 200 matches and 365 days',()=>{
  const i=input();const rows=Array.from({length:400},(_,n)=>({...i.history[0],fixtureId:'event-'+String(n).padStart(3,'0'),startsAt:iso(Date.parse(asOf)-(401-n)*DAY),completedAt:iso(Date.parse(asOf)-(401-n)*DAY+1000),observedAt:iso(Date.parse(asOf)-(401-n)*DAY+2000)}));
  const chosen=eligibleHistory({...i,history:rows});assert.equal(chosen.length,200);assert.equal(chosen[0].fixtureId,'event-200');assert.equal(chosen.at(-1)!.fixtureId,'event-399');
});
test('invalid target and publication dates fail instead of making retrospective predictions',()=>{
  const i=input();assert.throws(()=>predict({...i,asOf:startsAt},pub));assert.throws(()=>predict(i,{...pub,generatedAt:startsAt}));
  assert.throws(()=>predict({...i,fixture:{...i.fixture,homeId:'B'}},pub));
});
test('unseen participants use league priors and LOW_SAMPLE, with reduced confidence',()=>{
  const i=input(),regular=predict(i,pub);i.fixture={...i.fixture,homeId:'unknown-1',awayId:'unknown-2'};
  const cold=predict(i,pub);assert.equal(cold.summary.availability,'ready');assert.ok(cold.analysis.warnings.includes('LOW_SAMPLE'));assert.ok(cold.summary.confidence!<regular.summary.confidence!);
});
test('football time weighting changes strength towards more recent results',()=>{
  const i=input();const rows=i.history.map((r,n)=>({...r,homeId:'A',awayId:'B',homeScore:n<10?0:4,awayScore:1}));
  const reversed=rows.map((r,n)=>({...r,homeScore:n<10?4:0}));
  assert.ok(predict({...i,history:rows},pub,{football:PREVIOUS_FOOTBALL}).summary.expectedScore!.home>predict({...i,history:reversed},pub,{football:PREVIOUS_FOOTBALL}).summary.expectedScore!.home);
});
test('neutral football removes the fitted home venue baseline',()=>{
  const i=input();i.fixture.homeId='unknown-1';i.fixture.awayId='unknown-2';i.fixture.neutralVenue=true;
  const s=predict(i,pub,{football:PREVIOUS_FOOTBALL}).summary;close(s.expectedScore!.home,s.expectedScore!.away);close(s.winProbability!.home,s.winProbability!.away);
  const fit=fitFootball(eligibleHistory(i),asOf);assert.ok(Number.isFinite(fit.rho));
});
test('missing, null, stale and future health gracefully match the no-health prediction',()=>{
  const i=input(),p=predict(i,pub);
  assert.deepEqual(p,predict({...i,injuries:null,teamHealth:null},pub));
  assert.deepEqual(p,predict({...i,teamHealth:[{participantId:'A',availabilityScore:0,restDays:0,observedAt:startsAt,source:'test'}]},pub));
  assert.deepEqual(p,predict({...i,injuries:[{participantId:'A',athleteId:'athlete',status:'out',observedAt:'2024-01-01T00:00:00.000Z',source:'test'}]},pub));
});
test('football injuries reduce own strength and are deduplicated, bounded, and not double-counted with health',()=>{
  const opts={football:PREVIOUS_FOOTBALL,experimentalFootballHealth:true};
  const i=input(),p=predict(i,pub,opts);
  const injury={participantId:'A',athleteId:'athlete',status:'out' as const,observedAt:asOf,source:'test'};
  const injured=predict({...i,injuries:[injury]},pub,opts);assert.ok(injured.summary.expectedScore!.home<p.summary.expectedScore!.home);
  assert.deepEqual(injured,predict({...i,injuries:[injury,injury]},pub,opts));assert.ok(injured.analysis.featuresUsed.includes('injuries'));
  const health={participantId:'A',availabilityScore:0.5,restDays:3,observedAt:asOf,source:'test'};
  close(predict({...i,teamHealth:[health]},pub,opts).summary.expectedScore!.home,predict({...i,teamHealth:[health],injuries:[injury]},pub,opts).summary.expectedScore!.home);
});
test('basketball rest advantage raises win probability without breaking expected scores',()=>{
  const i=input('basketball');const h=(participantId:string,restDays:number)=>({participantId,availabilityScore:1,restDays,observedAt:asOf,source:'test'});
  const rested=predict({...i,teamHealth:[h('A',3),h('B',0)]},pub),fatigued=predict({...i,teamHealth:[h('A',0),h('B',3)]},pub);
  assert.ok(rested.summary.winProbability!.home>fatigued.summary.winProbability!.home);
});
test('basketball neutral venue removes the home-court adjustment',()=>{
  const i=input('basketball'),home=predict(i,pub),neutral=predict({...i,fixture:{...i.fixture,neutralVenue:true}},pub);
  close(home.analysis.projectedMargin!-neutral.analysis.projectedMargin!,3.1);
});
test('tennis surface form changes with surface and missing history warns honestly',()=>{
  const i=input('tennis');i.history=i.history.map((r,n)=>({...r,homeId:'A',awayId:'B',homeScore:n%2?2:0,awayScore:n%2?0:2,surface:n%2?'clay':'hard'}));
  const clay=predict({...i,surface:'clay'},pub),hard=predict({...i,surface:'hard'},pub);
  assert.ok(clay.summary.winProbability!.home>hard.summary.winProbability!.home);assert.ok(clay.analysis.featuresUsed.includes('surface'));
  assert.ok(predict({...i,surface:'grass'},pub).analysis.warnings.includes('SURFACE_NOT_USED'));
});
test('tennis player ordering has no home advantage',()=>{
  const i=input('tennis'),p=predict(i,pub);const swapped=predict({...i,fixture:{...i.fixture,homeId:'B',awayId:'A'}},pub);
  close(p.summary.winProbability!.home,swapped.summary.winProbability!.away);
});
test('tennis fatigue can be disabled for archives without match timestamps',()=>{
  const i=input('tennis'),h=(participantId:string,restDays:number)=>({participantId,availabilityScore:1,restDays,observedAt:asOf,source:'test'});
  i.teamHealth=[h('A',3),h('B',0)];const rested=predict(i,pub);const ignored=predict(i,pub,{restAdjustment:false});
  assert.ok(rested.summary.winProbability!.home>ignored.summary.winProbability!.home);assert.ok(ignored.analysis.warnings.includes('REST_NOT_USED'));
});
test('baseline remains the rounded shipped mathematics',()=>{
  const i=input('basketball');i.history=i.history.map(r=>({...r,homeId:'C',awayId:'D'}));
  const b=baseline(i)!;assert.equal(b.model.version,'PA-Margin 1.0');assert.equal(b.probabilities[0],Math.round(100/(1+Math.exp(-3.1/6.8))));
  assert.equal(baseline({...i,history:[]}),null);
});
