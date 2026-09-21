import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, updateScores, getScores } from '../src/stateStore.js';

test('getScores returns null when no scores have been recorded', () => {
  const state = createEmptyState();
  assert.equal(getScores(state, 1), null);
});

test('updateScores then getScores round-trips the latest scores', () => {
  const state = createEmptyState();
  updateScores(state, 1, { srs_score: 756, shodan_score: 88 });
  assert.deepEqual(getScores(state, 1), { srs_score: 756, shodan_score: 88 });
});
