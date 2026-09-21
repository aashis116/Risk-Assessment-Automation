import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, hasOpenTicket, recordTicket, clearTicket } from '../src/stateStore.js';

test('hasOpenTicket is false when nothing has been recorded', () => {
  const state = createEmptyState();
  assert.equal(hasOpenTicket(state, 1, 'srs_score'), false);
});

test('hasOpenTicket is true after recordTicket for the same vendor/metric', () => {
  const state = createEmptyState();
  recordTicket(state, 1, 'srs_score', 42);
  assert.equal(hasOpenTicket(state, 1, 'srs_score'), true);
});

test('hasOpenTicket is false for a different metric on the same vendor', () => {
  const state = createEmptyState();
  recordTicket(state, 1, 'srs_score', 42);
  assert.equal(hasOpenTicket(state, 1, 'shodan_score'), false);
});

test('hasOpenTicket is false for a different vendor', () => {
  const state = createEmptyState();
  recordTicket(state, 1, 'srs_score', 42);
  assert.equal(hasOpenTicket(state, 2, 'srs_score'), false);
});

test('clearTicket allows a new ticket to be recorded for the same vendor/metric', () => {
  const state = createEmptyState();
  recordTicket(state, 1, 'srs_score', 42);
  clearTicket(state, 1, 'srs_score');
  assert.equal(hasOpenTicket(state, 1, 'srs_score'), false);
});
