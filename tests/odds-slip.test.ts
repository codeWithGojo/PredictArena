import assert from 'node:assert/strict';
import test from 'node:test';
import { estimatedTotal, generateForOdds } from '../lib/odds-slip.ts';
import type { Match } from '../lib/sports.ts';

const fixture = (id: string, probabilities = [.8, .6], confidence = 75): Match => ({
  id, sport: 'football', league: 'Test', leagueShort: 'T', leagueId: '1',
  kickoffISO: '2030-01-01T12:00:00Z', date: '1 Jan', time: '13:00',
  home: { name: id, short: id, colors: ['#000', '#fff'] },
  away: { name: 'Away', short: 'AWY', colors: ['#000', '#fff'] },
  source: 'live-api', sourceLabel: 'Provider', confidence, probabilities: [50, 25, 25],
  model: { method: 'Poisson', version: '1', sampleSize: 100, factors: [], caveat: '' },
  predictions: probabilities.map((probability, i) => ({ label: `Over ${i + 1.5} goals`, value: `${probability * 100}%`, market: 'total', selection: 'over', line: i + 1.5, probability })),
});

test('target decides the number of games and can choose a different market to match odds', () => {
  const matches = [fixture('a'), fixture('b'), fixture('c')];
  const single = generateForOdds(matches, 1.25, 55);
  assert.equal(single.length, 1);
  assert.equal(estimatedTotal(single), 1.25);
  const combo = generateForOdds(matches, 1.25 * 1.67, 55);
  assert.equal(combo.length, 2);
  assert.equal(estimatedTotal(combo), 1.25 * 1.67);
  assert.equal(new Set(combo.map(p => p.fixtureId)).size, 2);
  assert.ok(combo.every(p => p.odds === ''));
});

test('equal odds prefer higher confidence and input order does not affect the result', () => {
  const matches = [fixture('weak', [.8], 62), fixture('strong', [.8], 90)];
  assert.equal(generateForOdds(matches, 1.25, 55)[0].fixtureId, 'strong');
  assert.deepEqual(generateForOdds(matches, 1.25, 55), generateForOdds(matches.reverse(), 1.25, 55));
});

test('quality, probability, kickoff and fixture uniqueness gates are preserved', () => {
  const good = fixture('good', [.8, .95]);
  const thin = { ...fixture('thin'), model: { ...good.model, sampleSize: 4 } };
  const expired = { ...fixture('past'), kickoffISO: '2020-01-01T12:00:00Z' };
  const picks = generateForOdds([good, good, thin, expired, fixture('weak', [.8], 61)], 20, 75);
  assert.equal(picks.length, 1);
  assert.equal(picks[0].fixtureId, 'good');
  assert.equal(picks[0].probability, .8);
  assert.deepEqual(generateForOdds([good], 5, 85), []);
});

test('invalid targets and empty feeds return no picks; unreachable targets return a close suggestion', () => {
  for (const target of [0, 1, NaN, Infinity, 10001]) assert.deepEqual(generateForOdds([fixture('a')], target, 55), []);
  assert.deepEqual(generateForOdds([], 5, 55), []);
  assert.equal(estimatedTotal(generateForOdds([fixture('a')], 100, 55)), 1.67);
  assert.equal(estimatedTotal(generateForOdds([fixture('a')], 1.01, 55)), 1.25);
});

test('large fixture sets stay within the twenty-game limit', () => {
  const picks = generateForOdds(Array.from({ length: 300 }, (_, i) => fixture(`${i}`, [.8, .6])), 10000, 55);
  assert.ok(picks.length > 0 && picks.length <= 20);
  assert.equal(new Set(picks.map(p => p.fixtureId)).size, picks.length);
});
