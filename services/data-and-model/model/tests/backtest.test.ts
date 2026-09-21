import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {evaluateRecorded} from '../backtest/run.ts';
import type {ModelInput} from '../types.ts';

test('published benchmark datasets match recorded checksums and have unique fixture IDs',()=>{
  const provenance=JSON.parse(readFileSync(new URL('../backtest/data/provenance.json',import.meta.url),'utf8'));
  for(const [name,hash] of Object.entries(provenance.datasets)) {
    const bytes=readFileSync(new URL('../backtest/data/'+name,import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);
    const rows: {id:string;homeScore:number;awayScore:number}[]=JSON.parse(bytes.toString());
    assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
    assert.ok(rows.every(r=>Number.isInteger(r.homeScore)&&Number.isInteger(r.awayScore)));
  }
});
test('recorded-input backtest skips missing history and scores the actual target outcome',()=>{
  const input:ModelInput={schemaVersion:1,asOf:'2024-01-03T00:00:00.000Z',
    fixture:{id:'test',sport:'basketball',competitionId:'basketball:nba',season:'2023',startsAt:'2024-01-04T00:00:00.000Z',homeId:'A',awayId:'B',neutralVenue:false},
    history:[{fixtureId:'previous',competitionId:'basketball:nba',homeId:'C',awayId:'D',homeScore:100,awayScore:90,unit:'points',startsAt:'2024-01-01T00:00:00.000Z',completedAt:'2024-01-01T03:00:00.000Z',observedAt:'2024-01-01T04:00:00.000Z'}],
  };
  const report=evaluateRecorded([{input,outcome:0},{input:{...input,history:[]},outcome:0}]);
  assert.equal(report.n,1);assert.equal(report.skipped,1);
  const p=1/(1+Math.exp(-3.1/8));
  assert.ok(Math.abs(report.new!.logLoss+Math.log(p))<1e-10);
  assert.ok(Math.abs(report.new!.brier-2*(1-p)**2)<1e-10);
  const away=evaluateRecorded([{input,outcome:1}]);assert.ok(away.new!.logLoss>report.new!.logLoss);
});
