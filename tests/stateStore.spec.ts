import { test, expect } from '@playwright/test';
import { detectScoreChanges } from '../src/stateStore.js';

test('returns no changes when there is no previous state', () => {
  const changes = detectScoreChanges(null, { srs_score: 756, shodan_score: 88 });
  expect(changes).toEqual([]);
});

test('returns no changes when scores are unchanged', () => {
  const prev = { srs_score: 756, shodan_score: 88 };
  const curr = { srs_score: 756, shodan_score: 88 };
  expect(detectScoreChanges(prev, curr)).toEqual([]);
});

test('returns no changes when scores improve', () => {
  const prev = { srs_score: 700, shodan_score: 80 };
  const curr = { srs_score: 756, shodan_score: 88 };
  expect(detectScoreChanges(prev, curr)).toEqual([]);
});

test('detects a significant SRS score drop', () => {
  const prev = { srs_score: 756, shodan_score: 88 };
  const curr = { srs_score: 700, shodan_score: 88 };
  const changes = detectScoreChanges(prev, curr);
  expect(changes).toEqual([{ metric: 'srs_score', previous: 756, current: 700, delta: -56 }]);
});

test('ignores an SRS score drop below the threshold', () => {
  const prev = { srs_score: 756, shodan_score: 88 };
  const curr = { srs_score: 745, shodan_score: 88 };
  expect(detectScoreChanges(prev, curr)).toEqual([]);
});

test('detects a significant Shodan score drop', () => {
  const prev = { srs_score: 756, shodan_score: 88 };
  const curr = { srs_score: 756, shodan_score: 80 };
  const changes = detectScoreChanges(prev, curr);
  expect(changes).toEqual([{ metric: 'shodan_score', previous: 88, current: 80, delta: -8 }]);
});

test('detects both metrics dropping simultaneously', () => {
  const prev = { srs_score: 756, shodan_score: 88 };
  const curr = { srs_score: 700, shodan_score: 80 };
  expect(detectScoreChanges(prev, curr).length).toBe(2);
});

test('respects custom thresholds', () => {
  const prev = { srs_score: 756, shodan_score: 88 };
  const curr = { srs_score: 745, shodan_score: 88 };
  const changes = detectScoreChanges(prev, curr, { srs: 5, shodan: 5 });
  expect(changes).toEqual([{ metric: 'srs_score', previous: 756, current: 745, delta: -11 }]);
});
