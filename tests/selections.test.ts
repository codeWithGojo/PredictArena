import assert from 'node:assert/strict';
import test from 'node:test';
import { canRecommend, choices, generate, validatePicks } from '../lib/selections.ts';
import type { Match } from '../lib/sports.ts';
const fixture = (id: string, confidence = 70, caveat = ''): Match => ({
  id, sport: 'football', league: 'Test League', leagueShort: 'TL', leagueId: '1',
  kickoffISO: '2030-01-01T12:00:00.000Z', date: '1 Jan', time: '13:00',
  home: { name: 'Home', short: 'HOM', colors: ['#000', '#fff'] },
  away: { name: 'Away', short: 'AWY', colors: ['#000', '#fff'] },
  source: 'live-api', sourceLabel: 'Provider', confidence, probabilities: [50, 25, 25],
  model: { method: 'Poisson', version: '1', sampleSize: 100, factors: [], caveat },
  predictions: [
    { label: 'Home or draw', value: '75%', market: 'double-chance', selection: 'home-draw', probability: .75 },
    { label: 'Over 1.5 goals', value: '80%', market: 'total', selection: 'over', line: 1.5, probability: .8 },
    { label: 'Under 3.5 goals', value: '95%', market: 'total', selection: 'under', line: 3.5, probability: .95 },
  ],
});

test('automatic slips exclude weak or thin history even when market probability is high', () => {
  const result = generate([fixture('low-confidence', 32), fixture('low-sample', 80, 'LOW_SAMPLE'), fixture('good')], 3, 55);
  assert.equal(result.length, 1);
  assert.equal(result[0].fixtureId, 'good');
  assert.equal(result[0].probability, .8);
  assert.equal(canRecommend({ ...fixture('none'), probabilities: [] }), false);
  assert.equal(canRecommend({ ...fixture('fallback'), source: 'fallback' }), false);
});

test('a slip has one selection per fixture and honours requested market probability', () => {
  const matches = [fixture('one'), fixture('two')];
  const result = generate(matches, 3, 75);
  assert.equal(new Set(result.map((pick) => pick.fixtureId)).size, 2);
  assert.equal(result.length, 2);
  assert.ok(result.every((pick) => pick.probability <= .85));
  assert.deepEqual(generate(matches, 3, 85), []);
});

test('saved picks survive serialization, remove duplicates, and expire after kickoff', () => {
  const pick = choices(fixture('one'))[0];
  const expired = { ...pick, fixtureId: 'past', kickoffISO: '2020-01-01T00:00:00.000Z' };
  const raw = JSON.parse(JSON.stringify([pick, pick, expired, { fixtureId: 'invalid' }]));
  assert.deepEqual(validatePicks(raw, Date.parse('2026-10-02T12:00:00Z')), [pick]);
  assert.deepEqual(validatePicks(raw, Date.parse('2030-01-01T12:00:00Z')), []);
});
