import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectScoreChanges } from '../src/stateStore.js';

test('returns no changes when there is no previous state', () => {
  const changes = detectScoreChanges(null, { srs_score: 756, shodan_score: 88 });
  assert.deepEqual(changes, []);
});

test('returns no changes when scores are unchanged', () => {
  const prev = { srs_score: 756, shodan_score: 88 };
  const curr = { srs_score: 756, shodan_score: 88 };
  assert.deepEqual(detectScoreChanges(prev, curr), []);
});

test('returns no changes when scores improve', () => {
  const prev = { srs_score: 700, shodan_score: 80 };
  const curr = { srs_score: 756, shodan_score: 88 };
  assert.deepEqual(detectScoreChanges(prev, curr), []);
});

test('detects a significant SRS score drop', () => {
  const prev = { srs_score: 756, shodan_score: 88 };
  const curr = { srs_score: 700, shodan_score: 88 };
  const changes = detectScoreChanges(prev, curr);
  assert.deepEqual(changes, [
    { metric: 'srs_score', previous: 756, current: 700, delta: -56 },
  ]);
});

test('ignores an SRS score drop below the threshold', () => {
  const prev = { srs_score: 756, shodan_score: 88 };
  const curr = { srs_score: 745, shodan_score: 88 };
  assert.deepEqual(detectScoreChanges(prev, curr), []);
});

test('detects a significant Shodan score drop', () => {
  const prev = { srs_score: 756, shodan_score: 88 };
  const curr = { srs_score: 756, shodan_score: 80 };
  const changes = detectScoreChanges(prev, curr);
  assert.deepEqual(changes, [
    { metric: 'shodan_score', previous: 88, current: 80, delta: -8 },
  ]);
});

test('detects both metrics dropping simultaneously', () => {
  const prev = { srs_score: 756, shodan_score: 88 };
  const curr = { srs_score: 700, shodan_score: 80 };
  const changes = detectScoreChanges(prev, curr);
  assert.equal(changes.length, 2);
});

test('respects custom thresholds', () => {
  const prev = { srs_score: 756, shodan_score: 88 };
  const curr = { srs_score: 745, shodan_score: 88 };
  const changes = detectScoreChanges(prev, curr, { srs: 5, shodan: 5 });
  assert.deepEqual(changes, [
    { metric: 'srs_score', previous: 756, current: 745, delta: -11 },
  ]);
});
