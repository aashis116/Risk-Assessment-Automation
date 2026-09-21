import { test, expect } from '@playwright/test';
import { createEmptyState, updateScores, getScores } from '../src/stateStore.js';

test('getScores returns null when no scores have been recorded', () => {
  const state = createEmptyState();
  expect(getScores(state, 1)).toBeNull();
});

test('updateScores then getScores round-trips the latest scores', () => {
  const state = createEmptyState();
  updateScores(state, 1, { srs_score: 756, shodan_score: 88 });
  expect(getScores(state, 1)).toEqual({ srs_score: 756, shodan_score: 88 });
});
