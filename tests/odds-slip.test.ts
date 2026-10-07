import assert from 'node:assert/strict';
import test from 'node:test';
import { bestOddsOption, estimatedTotal, generateForOdds, selectionOptions, targetTotal } from '../lib/odds-slip.ts';
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

test('target decides the number of games using only the best option for each game', () => {
  const matches = [fixture('a'), fixture('b'), fixture('c')];
  const single = generateForOdds(matches, 1.25, 55);
  assert.equal(single.length, 1);
  assert.equal(estimatedTotal(single), 1.25);
  const combo = generateForOdds(matches, 1.25 * 1.25, 55);
  assert.equal(combo.length, 2);
  assert.equal(estimatedTotal(combo), 1.25 * 1.25);
  assert.equal(new Set(combo.map(p => p.fixtureId)).size, 2);
  assert.ok(combo.every(p => p.odds === '' && p.probability === .8));
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
  const lowSample = { ...fixture('low-sample'), model: { ...good.model, caveat: 'LOW_SAMPLE' } };
  const picks = generateForOdds([good, good, thin, expired, lowSample], 20, 75);
  assert.equal(picks.length, 1);
  assert.equal(picks[0].fixtureId, 'good');
  assert.equal(picks[0].probability, .95);
  assert.deepEqual(generateForOdds([good], 5, 96), []);
});

test('invalid targets and empty feeds return no picks; unreachable targets return a close suggestion', () => {
  for (const target of [0, 1, NaN, Infinity, 10001]) assert.deepEqual(generateForOdds([fixture('a')], target, 55), []);
  assert.deepEqual(generateForOdds([], 5, 55), []);
  assert.equal(estimatedTotal(generateForOdds([fixture('a')], 100, 55)), 1.25);
  assert.equal(estimatedTotal(generateForOdds([fixture('a')], 1.01, 55)), 1.25);
});

test('large fixture sets stay within the twenty-game limit', () => {
  const picks = generateForOdds(Array.from({ length: 300 }, (_, i) => fixture(`${i}`, [.8, .6])), 10000, 55);
  assert.ok(picks.length > 0 && picks.length <= 20);
  assert.equal(new Set(picks.map(p => p.fixtureId)).size, picks.length);
});


test('current-feed confidence levels can produce picks without changing confidence or probability', () => {
  const match = fixture('current', [.7, .91], 49);
  const best = bestOddsOption(match, 45)!;
  assert.equal(best.probability, .91);
  assert.equal(generateForOdds([match], 1.1, 45)[0].probability, .91);
  assert.equal(match.confidence, 49);
  assert.equal(best.odds, '');
  assert.equal(bestOddsOption({ ...match, source: 'fallback' }, 45), undefined);
  assert.equal(bestOddsOption({ ...match, confidence: NaN }, 45), undefined);
  assert.equal(bestOddsOption(match, NaN), undefined);
});

test('within five percent of target, prefer stronger coverage over a slightly closer weak game', () => {
  const result = generateForOdds([fixture('strong', [.8], 90), fixture('weak-exact', [.79], 49)], 1.27, 55);
  assert.equal(result.length, 1);
  assert.equal(result[0].fixtureId, 'strong');
});

const withSnapshot = (match: Match): Match => ({ ...match, bookmakerInput: {
  bookmaker: 'SportyBet', fixtureId: 'test', capturedDate: '2026-10-07', receivedAt: '2026-10-07T16:00:00Z',
  sourceFile: 'test.jpg', odds: [1.8, 3, 4.5], probabilities: [.5, .3, .2], method: 'Normalized implied 1X2 probabilities',
} });
test('all-market mode compares goals, BTTS, double chance and captured match-result prices', () => {
  const goals = withSnapshot(fixture('goals', [.85]));
  const btts = withSnapshot({ ...fixture('btts'), predictions: [{ label: 'Both teams score: yes', value:'86%', market:'btts', selection:'yes', probability:.86 }] });
  assert.equal(bestOddsOption(goals,55,'auto')?.market,'total');
  assert.equal(bestOddsOption(btts,55,'auto')?.market,'btts');
  const picks=generateForOdds([goals,btts],1.18*1.16,55,Date.parse('2026-10-07'),'auto');
  assert.deepEqual(new Set(picks.map(p=>p.market)),new Set(['total','btts']));
  assert.equal(new Set(picks.map(p=>p.fixtureId)).size,picks.length);
  const dc=bestOddsOption(goals,55,'auto',['double-chance'])!;
  assert.equal(dc.selection,'home-draw');assert.equal(dc.probability,.8);
  assert.equal(dc.odds,'');assert.equal(targetTotal([dc]),1.25);
  const result=bestOddsOption(goals,45,'auto',['result'])!;
  assert.equal(result.odds,'1.8');assert.equal(targetTotal([result]),1.8);
  assert.deepEqual(generateForOdds([goals],2,55,Date.now(),'auto',[]),[]);
  assert.ok(selectionOptions(goals,'bookmaker').every(p=>p.market==='1x2'&&p.odds));
});
test('market-only leagues derive double chance without inventing goals history or actual prices', () => {
  const match=withSnapshot({ ...fixture('market-only'), probabilities:[],predictions:[],confidence:0,model:{...fixture('a').model,sampleSize:0,caveat:'NO_HISTORY'} });
  const options=selectionOptions(match,'auto');
  assert.equal(options.length,6);
  assert.ok(options.every(p=>['1x2','double-chance'].includes(p.market)));
  assert.deepEqual(selectionOptions(match,'auto',['total','btts']),[]);
  assert.equal(bestOddsOption(match,55,'auto')?.market,'double-chance');
});
