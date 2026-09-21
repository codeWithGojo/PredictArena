/**
 * Retrospective comparison against Pinnacle closing 1X2 odds from the same
 * football-data.co.uk files used by the chronological walk-forward backtest.
 * The 50:50 blend is deliberately fixed before scoring, not fitted to results.
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {footballForecast, LEGACY_FOOTBALL} from '../../football.ts';
import {properScores} from '../../math.ts';
import {replay} from './walk-forward.ts';
import type {Row} from './walk-forward.ts';

type OddsRow = Row & {closingOdds?: [number, number, number] | null};
type Method = 'defaultModel' | 'bookmaker' | 'blend50';
type Score = {league:string; season:string; logLoss:number; brier:number};
const root = new URL('./', import.meta.url);
const read = (name:string) => readFileSync(new URL(name, root));
const json = <T>(name:string):T => JSON.parse(read(name).toString());
const mean = (values:number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

/** Remove a single-market overround by proportional normalization. */
export function devig(decimalOdds:readonly number[]): [number, number, number] {
  if (decimalOdds.length !== 3 || decimalOdds.some(value => !Number.isFinite(value) || value <= 1)) {
    throw new RangeError('Expected three valid decimal odds greater than one.');
  }
  const implied = decimalOdds.map(value => 1 / value);
  const total = implied.reduce((sum, value) => sum + value, 0);
  return [implied[0] / total, implied[1] / total, implied[2] / total];
}

export function blend(model:readonly number[], bookmaker:readonly number[]): [number, number, number] {
  if (model.length !== 3 || bookmaker.length !== 3) throw new RangeError('Expected 1X2 probabilities.');
  return [0.5 * (model[0] + bookmaker[0]), 0.5 * (model[1] + bookmaker[1]), 0.5 * (model[2] + bookmaker[2])];
}

function report(rows:Score[]) {
  const summarize = (values:Score[]) => ({n:values.length, logLoss:mean(values.map(value => value.logLoss)), brier:mean(values.map(value => value.brier))});
  const keys = [...new Set(rows.map(row => `${row.league}/${row.season}`))].sort();
  return {pooled:summarize(rows), bySeason:keys.map(key => {
    const values = rows.filter(row => `${row.league}/${row.season}` === key);
    return {league:values[0].league, season:values[0].season, ...summarize(values)};
  })};
}

function hash(value:Buffer) { return createHash('sha256').update(value).digest('hex'); }

export function main() {
  const source = json<OddsRow[]>('results-data.json');
  const provenance = json<{datasetSha256:string}>('provenance.json');
  if (hash(read('results-data.json')) !== provenance.datasetSha256) throw new Error('Dataset hash mismatch.');
  const seasons = ['2019', '2020', '2021', '2022', '2023', '2024'];
  const {records, skipped} = replay(source, seasons);
  if (skipped.length) throw new Error(`Walk-forward replay skipped ${skipped.length} scored fixtures.`);
  const odds = new Map(source.filter(row => row.closingOdds).map(row => [row.id, row.closingOdds!]));
  const scored:Record<Method, Score[]> = {defaultModel:[], bookmaker:[], blend50:[]};
  const excluded: {id:string; reason:string}[] = [];
  for (const record of records) {
    const decimalOdds = odds.get(record.input.fixture.id);
    if (!decimalOdds) { excluded.push({id:record.input.fixture.id, reason:'missing_closing_odds'}); continue; }
    const bookmaker = devig(decimalOdds);
    const model = footballForecast(record.input, record.input.history, LEGACY_FOOTBALL).probabilities;
    const common = {league:record.league, season:record.season};
    scored.defaultModel.push({...common, ...properScores(model, record.outcome)});
    scored.bookmaker.push({...common, ...properScores(bookmaker, record.outcome)});
    scored.blend50.push({...common, ...properScores(blend(model, bookmaker), record.outcome)});
  }
  const reports = Object.fromEntries((Object.keys(scored) as Method[]).map(method => [method, report(scored[method])])) as Record<Method, ReturnType<typeof report>>;
  const output = {
    source: {provider:'football-data.co.uk', bookmaker:'Pinnacle', columns:['PSCH', 'PSCD', 'PSCA'], timing:'closing'},
    protocol: {seasons, blend:'Equal 50:50 arithmetic blend of default model and de-vigged bookmaker probabilities. Fixed, not tuned.', metrics:'Natural-log loss and summed three-class Brier. Lower is better.'},
    datasetSha256: provenance.datasetSha256, totalWalkForwardFixtures: records.length, excluded, results: reports,
  };
  writeFileSync(new URL('odds-benchmark.json', root), JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify(Object.fromEntries((Object.keys(reports) as Method[]).map(method => [method, reports[method].pooled])), null, 2));
}

if (process.argv[1] && import.meta.url === new URL(`file:${process.argv[1]}`).href) main();
