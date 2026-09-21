import test from 'node:test';
import assert from 'node:assert/strict';
import {blend, devig} from '../backtest/football/odds-benchmark.ts';

test('de-vig normalizes three implied probabilities', () => {
  const probabilities = devig([2, 4, 4]);
  assert.deepEqual(probabilities, [0.5, 0.25, 0.25]);
  assert.equal(probabilities.reduce((sum, value) => sum + value, 0), 1);
});

test('blend is an equal, normalized mixture', () => {
  assert.deepEqual(blend([0.6, 0.2, 0.2], [0.4, 0.3, 0.3]), [0.5, 0.25, 0.25]);
});
