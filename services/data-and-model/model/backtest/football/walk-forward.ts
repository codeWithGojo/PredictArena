import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {ModelInput,History} from '../../types.ts';
import {eligibleHistory} from '../../input.ts';
import {footballForecast,LEGACY_FOOTBALL,PREVIOUS_FOOTBALL} from '../../football.ts';
import type {FootballConfig} from '../../football.ts';
import {properScores,DAY} from '../../math.ts';
export type Row={id:string;league:string;season:string;date:string;home:string;away:string;homeScore:number;awayScore:number};
export type Record={input:ModelInput;outcome:number;league:string;season:string;date:string};
type Scored={league:string;season:string;date:string;logLoss:number;brier:number;draw:number;isDraw:number};
const root=new URL('./',import.meta.url);
const read=(name:string)=>readFileSync(new URL(name,root));
const json=(name:string)=>JSON.parse(read(name).toString());
const save=(name:string,value:unknown)=>writeFileSync(new URL(name,root),JSON.stringify(value,null,2)+'\n');
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const mean=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/xs.length;
const iso=(ms:number)=>new Date(ms).toISOString();
export const ABLATIONS:{name:string;config:FootballConfig}[]=[
  {name:'strength_only',config:{mode:'strength',homeAdvantage:false,halfLifeDays:null,priorMatches:0,rhoPenalty:null}},
  {name:'plus_home',config:{mode:'strength',homeAdvantage:true,halfLifeDays:null,priorMatches:0,rhoPenalty:null}},
  {name:'plus_decay',config:{mode:'strength',homeAdvantage:true,halfLifeDays:90,priorMatches:0,rhoPenalty:null}},
  {name:'plus_dc',config:{mode:'strength',homeAdvantage:true,halfLifeDays:90,priorMatches:0,rhoPenalty:100}},
  {name:'plus_shrinkage',config:PREVIOUS_FOOTBALL},
  {name:'v2_without_home',config:{...PREVIOUS_FOOTBALL,homeAdvantage:false}},
  {name:'v2_without_decay',config:{...PREVIOUS_FOOTBALL,halfLifeDays:null}},
  {name:'v2_without_dc',config:{...PREVIOUS_FOOTBALL,rhoPenalty:null}},
  {name:'v2_without_shrinkage',config:{...PREVIOUS_FOOTBALL,priorMatches:0}},
];
/** Date replay only. Production eligibleHistory never invents observation timestamps. */
export function replay(source:Row[],seasons:readonly string[]) {
  const sorted=[...source].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  const histories=new Map<string,History[]>();
  for(const r of sorted){const at=Date.parse(r.date),rows=histories.get(r.league)??[];
    rows.push({fixtureId:r.id,competitionId:'football:'+r.league,homeId:r.home,awayId:r.away,startsAt:iso(at),
      completedAt:iso(at+DAY),observedAt:iso(at+DAY),homeScore:r.homeScore,awayScore:r.awayScore,unit:'goals'});
    histories.set(r.league,rows);
  }
  const records:Record[]=[],skipped:Row[]=[];
  for(const r of sorted.filter(r=>seasons.includes(r.season))){const at=Date.parse(r.date),asOf=iso(at-1);
    const input:ModelInput={schemaVersion:1,fixture:{id:r.id,sport:'football',competitionId:'football:'+r.league,season:r.season,
      startsAt:iso(at),homeId:r.home,awayId:r.away,neutralVenue:false},asOf,
      history:(histories.get(r.league)??[]).filter(h=>h.observedAt<=asOf&&Date.parse(h.startsAt)>=at-1-365*DAY)};
    input.history=eligibleHistory(input);
    if(input.history.length<50){skipped.push(r);continue;}
    records.push({input,outcome:r.homeScore>r.awayScore?0:r.homeScore===r.awayScore?1:2,league:r.league,season:r.season,date:r.date});
  }
  return {records,skipped};
}
export function drawCalibration(rows:{draw:number;isDraw:number}[]) {
  const bins=Array.from({length:10},(_,i)=>{const rs=rows.filter(r=>Math.min(9,Math.floor(r.draw*10))===i);
    return {lower:i/10,upper:(i+1)/10,n:rs.length,predicted:rs.length?mean(rs.map(r=>r.draw)):null,observed:rs.length?mean(rs.map(r=>r.isDraw)):null};});
  return {n:rows.length,meanPredicted:mean(rows.map(r=>r.draw)),observed:mean(rows.map(r=>r.isDraw)),
    drawBrier:mean(rows.map(r=>(r.draw-r.isDraw)**2)),ece:bins.reduce((s,b)=>s+b.n*Math.abs((b.predicted??0)-(b.observed??0)),0)/rows.length,bins};
}
function summary(rows:Scored[]){return {n:rows.length,logLoss:mean(rows.map(r=>r.logLoss)),brier:mean(rows.map(r=>r.brier)),drawCalibration:drawCalibration(rows)};}
function evaluate(records:Record[],config:FootballConfig):Scored[]{return records.map(({input,outcome,league,season,date})=>{
  const {probabilities:p}=footballForecast(input,input.history,config);return {league,season,date,...properScores(p,outcome),draw:p[1],isDraw:Number(outcome===1)};});}
function report(rows:Scored[]){return {pooled:summary(rows),bySeason:[...new Set(rows.map(r=>r.league+'/'+r.season))].sort().map(key=>{
  const rs=rows.filter(r=>r.league+'/'+r.season===key);return {league:rs[0].league,season:rs[0].season,...summary(rs)};})};}
export function bestIndex(scores:number[]){if(!scores.length||scores.some(s=>!Number.isFinite(s)))throw new Error('Invalid selection scores');
  let best=0;for(let i=1;i<scores.length;i++)if(scores[i]<scores[best]-1e-12)best=i;return best;}
function fingerprint(){return hash(['protocol.json','../../football.ts','../../math.ts','../../legacy.ts','../../input.ts','walk-forward.ts'].map(n=>n+'\n'+read(n).toString()).join('\n'));}
function pairedInterval(old:Scored[],current:Scored[],metric:'logLoss'|'brier'){
  const blocks=new Map<string,number[]>();current.forEach((r,i)=>{const key=r.league+':'+r.date;blocks.set(key,[...(blocks.get(key)??[]),r[metric]-old[i][metric]]);});
  const groups=[...blocks.values()];let seed=731;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const samples=[];for(let k=0;k<2000;k++){let sum=0,n=0;for(let i=0;i<groups.length;i++){const block=groups[Math.floor(random()*groups.length)];sum+=block.reduce((a,b)=>a+b,0);n+=block.length;}samples.push(sum/n);}
  samples.sort((a,b)=>a-b);return [samples[49],samples[1949]];
}
export function main(stage:string){
  const protocol=json('protocol.json'),source:Row[]=json('results-data.json'),datasetSha256=hash(read('results-data.json'));
  if(datasetSha256!==json('provenance.json').datasetSha256)throw new Error('Dataset hash mismatch');
  const cache=new Map<string,Scored[]>();
  const score=(records:Record[],config:FootballConfig)=>{const key=JSON.stringify(config)+records.map(r=>r.input.fixture.id).join(',');
    if(!cache.has(key))cache.set(key,evaluate(records,config));return cache.get(key)!;};
  if(stage==='--select'){
    const tuning=replay(source,protocol.tuningSeasons),selection=replay(source,protocol.selectionSeasons);
    const grid:{config:FootballConfig;results:ReturnType<typeof report>}[]=[];
    for(const halfLifeDays of protocol.halfLifeDays)for(const priorMatches of protocol.priorMatches)for(const rhoPenalty of protocol.rhoPenalty){
      const config:FootballConfig={mode:'strength',homeAdvantage:true,halfLifeDays,priorMatches,rhoPenalty};
      const results=report(score(tuning.records,config));grid.push({config,results});console.log(`Tuning ${grid.length}/27: ${results.pooled.logLoss.toFixed(6)}`);
    }
    const tuningBestConfig=grid[bestIndex(grid.map(g=>g.results.pooled.logLoss))].config;
    const candidates=[{name:'old',config:LEGACY_FOOTBALL},{name:'previous_v2',config:PREVIOUS_FOOTBALL},
      ...grid.map((g,i)=>({name:'grid_'+String(i+1).padStart(2,'0'),config:g.config})),...ABLATIONS]
      .map(c=>({...c,results:report(score(selection.records,c.config))}));
    const winner=candidates[bestIndex(candidates.map(c=>c.results.pooled.logLoss))];
    const diagnostics=ABLATIONS.map(c=>({...c,tuning:report(score(tuning.records,c.config)),selection:report(score(selection.records,c.config))}));
    save('selection.json',{protocol,datasetSha256,codeSha256:fingerprint(),tuningSkipped:tuning.skipped.length,selectionSkipped:selection.skipped.length,
      grid,tuningBestConfig,candidates,winner:{name:winner.name,config:winner.config},diagnostics,
      tuningOld:report(score(tuning.records,LEGACY_FOOTBALL)),tuningWinner:report(score(tuning.records,winner.config))});
    // Report generation never changes a production default.
    console.log('Frozen candidate:',winner.config);
  }else if(stage==='--test'){
    const selected=json('selection.json');
    if(selected.datasetSha256!==datasetSha256||selected.codeSha256!==fingerprint())throw new Error('Selection fingerprint mismatch. Do not silently retune after reading tests.');
    const test=replay(source,protocol.testSeasons);
    const configs=[{name:'old',config:LEGACY_FOOTBALL},{name:'previous_v2',config:PREVIOUS_FOOTBALL},{name:'candidate',config:selected.winner.config},...ABLATIONS];
    const results=configs.map(c=>({...c,results:report(score(test.records,c.config))}));
    const old=score(test.records,LEGACY_FOOTBALL),current=score(test.records,selected.winner.config);
    const freshOld=old.filter(r=>!(r.league==='premier-league'&&r.season==='2023')),fresh=current.filter(r=>!(r.league==='premier-league'&&r.season==='2023'));
    save('test-results.json',{protocol,datasetSha256,selectionSha256:hash(read('selection.json')),codeSha256:fingerprint(),skipped:test.skipped.length,results,
      paired95Interval:{logLoss:pairedInterval(old,current,'logLoss'),brier:pairedInterval(old,current,'brier')},
      freshOnly:{old:report(freshOld),new:report(fresh),paired95Interval:{logLoss:pairedInterval(freshOld,fresh,'logLoss'),brier:pairedInterval(freshOld,fresh,'brier')}}});
    const promote=results[2].results.pooled.logLoss<results[0].results.pooled.logLoss;
    save('default-decision.json',{rule:protocol.releaseRule,selectionSha256:hash(read('selection.json')),testSha256:hash(read('test-results.json')),
      oldLogLoss:results[0].results.pooled.logLoss,candidateLogLoss:results[2].results.pooled.logLoss,
      defaultConfig:promote?selected.winner.config:LEGACY_FOOTBALL,
      reason:promote?'Frozen candidate beats legacy.':'Frozen candidate loses; retain legacy without further tuning.'});
    console.log(JSON.stringify(results.slice(0,3).map(c=>({name:c.name,logLoss:c.results.pooled.logLoss,brier:c.results.pooled.brier})),null,2));
  }else throw new Error('Use --select first, then --test.');
}
if(process.argv[1]&&import.meta.url===new URL('file:'+process.argv[1]).href)main(process.argv[2]);
