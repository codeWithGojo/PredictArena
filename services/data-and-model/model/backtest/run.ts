import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { History, ModelInput, Sport, Surface } from '../types.ts';
import { baseline } from '../baseline.ts';
import { predict, PARAMETERS, VERSIONS } from '../engine.ts';
import { DAY, properScores } from '../math.ts';
import { eligibleHistory } from '../input.ts';

type ArchiveRow = { id:string; date:string; season:string; home:string; away:string; homeScore:number; awayScore:number; surface?:Surface|null; bestOf?:3|5 };
const config = {
  football:{competitionId:'football:premier-league',unit:'goals',holdout:'2023',development:'2022'},
  basketball:{competitionId:'basketball:nba',unit:'points',holdout:'2014',development:'2013'},
  tennis:{competitionId:'tennis:atp',unit:'sets',holdout:'2023',development:'2022'},
} as const;
const iso = (ms:number) => new Date(ms).toISOString();
const mean = (values:number[]) => values.reduce((a,b) => a+b,0)/values.length;

/** Also supports genuine recorded inputs: no timestamps are inferred in this path. */
export function evaluateRecorded(records: { input:ModelInput; outcome:number }[]) {
  const totals = { old: [] as ReturnType<typeof properScores>[], new: [] as ReturnType<typeof properScores>[] };
  let skipped = 0;
  for (const {input,outcome} of records) {
    const old = baseline(input), current = predict(input,{id:'backtest:'+input.fixture.id,generatedAt:input.asOf,isStale:false});
    if (!old || !current.summary.winProbability) {skipped++;continue;}
    const p = current.summary.winProbability;
    totals.old.push(properScores(old.probabilities.map(p=>p/100),outcome));
    totals.new.push(properScores(input.fixture.sport === 'football' ? [p.home,p.draw!,p.away] : [p.home,p.away],outcome));
  }
  return {n:totals.old.length, skipped, old:summarize(totals.old), new:summarize(totals.new)};
}
function summarize(scores: ReturnType<typeof properScores>[]) {
  return scores.length ? {logLoss:mean(scores.map(s=>s.logLoss)), brier:mean(scores.map(s=>s.brier))} : null;
}
// Seeded cluster bootstrap, paired new-minus-old deltas. Blocks are dates or tennis tournaments.
function interval(blocks: Map<string, number[]>) {
  const groups = [...blocks.values()];
  if (groups.length < 2) return null;
  let state = 731;
  const random = () => { state = (Math.imul(1664525,state)+1013904223)>>>0; return state/4294967296; };
  const samples:number[]=[];
  for (let b=0;b<1000;b++) {
    let sum=0,n=0;
    for(let i=0;i<groups.length;i++) {const block=groups[Math.floor(random()*groups.length)];sum+=block.reduce((a,v)=>a+v,0);n+=block.length;}
    samples.push(sum/n);
  }
  samples.sort((a,b)=>a-b);
  return [samples[25],samples[974]];
}
export function evaluateArchive(sport: Sport, split:'development'|'holdout') {
  const settings=config[sport], file=new URL(`./data/${sport}.json`,import.meta.url);
  const bytes=readFileSync(file), source:ArchiveRow[]=JSON.parse(bytes.toString());
  const history:History[]=source.map(r=>({fixtureId:r.id,competitionId:settings.competitionId,homeId:r.home,awayId:r.away,
    startsAt:iso(Date.parse(r.date)),completedAt:iso(Date.parse(r.date)+(sport==='tennis'?21:1)*DAY),
    observedAt:iso(Date.parse(r.date)+(sport==='tennis'?21:1)*DAY),homeScore:r.homeScore,awayScore:r.awayScore,unit:settings.unit,
    ...(sport==='tennis'?{surface:r.surface}:{}),
  }));
  const oldScores:ReturnType<typeof properScores>[]=[], newScores:ReturnType<typeof properScores>[]=[];
  const logBlocks=new Map<string,number[]>(), brierBlocks=new Map<string,number[]>();
  let skipped=0, lowSample=0, meanHistory=0, surfaceUsed=0;
  const selected=source.filter(r=>r.season===settings[split]);
  for(const row of selected) {
    // Treat all matches on a calendar date as simultaneous. No same-day result leakage.
    const asOf=iso(Date.parse(row.date)-1), startsAt=iso(Date.parse(row.date));
    const lowerBound=iso(Date.parse(asOf)-365*DAY);
    const input:ModelInput={schemaVersion:1,fixture:{id:row.id,sport,competitionId:settings.competitionId,season:row.season,
      startsAt,homeId:row.home,awayId:row.away,neutralVenue:sport==='tennis'},asOf,
      history:history.filter(r=>r.observedAt<=asOf && r.startsAt>=lowerBound).slice(-200),
      ...(sport==='tennis'?{surface:row.surface,bestOf:row.bestOf}:{}),
    };
    // Identical selected rows for baseline and upgrade. Warm-up only, not target-dependent exclusion.
    const eligible=eligibleHistory(input);
    if(eligible.length<50){skipped++;continue;}
    input.history=eligible;
    const old=baseline(input)!, result=predict(input,{id:'backtest:'+row.id,generatedAt:asOf,isStale:false},{restAdjustment:sport!=='tennis'});
    const p=result.summary.winProbability!;
    const outcome=sport==='football'?(row.homeScore>row.awayScore?0:row.homeScore===row.awayScore?1:2):(row.homeScore>row.awayScore?0:1);
    const os=properScores(old.probabilities.map(p=>p/100),outcome), ns=properScores(sport==='football'?[p.home,p.draw!,p.away]:[p.home,p.away],outcome);
    oldScores.push(os);newScores.push(ns);
    if(result.analysis.warnings.includes('LOW_SAMPLE'))lowSample++;
    if(result.analysis.featuresUsed.includes('surface'))surfaceUsed++;
    meanHistory+=result.analysis.sampleSize;
    // Tournament ID is the fourth field of the stable archive ID.
    const block=sport==='tennis'?row.id.split(':')[2]:row.date;
    logBlocks.set(block,[...(logBlocks.get(block)??[]),ns.logLoss-os.logLoss]);
    brierBlocks.set(block,[...(brierBlocks.get(block)??[]),ns.brier-os.brier]);
  }
  const old=summarize(oldScores)!, current=summarize(newScores)!;
  return {sport,split,season:settings[split],n:oldScores.length,skipped,lowSample,surfaceUsed,meanHistory:meanHistory/oldScores.length,
    dateRange:[selected[0]?.date,selected.at(-1)?.date],datasetSha256:createHash('sha256').update(bytes).digest('hex'),
    old,new:current,delta:{logLoss:current.logLoss-old.logLoss,brier:current.brier-old.brier},
    paired95Interval:{logLoss:interval(logBlocks),brier:interval(brierBlocks)},
  };
}

if(process.argv[1] && import.meta.url===new URL('file:'+process.argv[1]).href) {
  const recordsIndex=process.argv.indexOf('--recorded');
  if(recordsIndex>=0) console.log(JSON.stringify(evaluateRecorded(JSON.parse(readFileSync(process.argv[recordsIndex+1],'utf8'))),null,2));
  else {
    const split=process.argv.includes('--development')?'development':'holdout';
    const report={mode:'retrospective-date-replay',split,parameters:PARAMETERS,versions:VERSIONS,
      baselineCommit:'bb18ff4c35fabba335763b127de6450a1b2f45e2',brierDefinition:'Mean sum of squared errors across all outcome classes (binary range 0..2).',
      notes:['No historical observedAt or health observations are available. This is not a point-in-time audit.',
        'Football and NBA results become eligible the next day; all same-day matches withheld.',
        'Tennis uses tournament start dates with a 21-day availability embargo and no rest adjustment.',
        'All models see the latest 200 eligible competition results within 365 days. Minimum 50 league results for warm-up.',
        'Intervals use 1000 seeded paired date-block bootstrap replicates, or tournament blocks for tennis.'],
      results:(['football','basketball','tennis'] as Sport[]).map(s=>evaluateArchive(s,split))};
    console.log(JSON.stringify(report,null,2));
    const output=process.argv.indexOf('--output');
    if(output>=0)writeFileSync(process.argv[output+1],JSON.stringify(report,null,2)+'\n');
  }
}
