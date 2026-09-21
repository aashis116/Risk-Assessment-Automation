import { test, expect } from '@playwright/test';
import { createEmptyState, hasOpenTicket, recordTicket, clearTicket } from '../src/stateStore.js';

test('hasOpenTicket is false when nothing has been recorded', () => {
  const state = createEmptyState();
  expect(hasOpenTicket(state, 1, 'srs_score')).toBe(false);
});

test('hasOpenTicket is true after recordTicket for the same vendor/metric', () => {
  const state = createEmptyState();
  recordTicket(state, 1, 'srs_score', 42);
  expect(hasOpenTicket(state, 1, 'srs_score')).toBe(true);
});

test('hasOpenTicket is false for a different metric on the same vendor', () => {
  const state = createEmptyState();
  recordTicket(state, 1, 'srs_score', 42);
  expect(hasOpenTicket(state, 1, 'shodan_score')).toBe(false);
});

test('hasOpenTicket is false for a different vendor', () => {
  const state = createEmptyState();
  recordTicket(state, 1, 'srs_score', 42);
  expect(hasOpenTicket(state, 2, 'srs_score')).toBe(false);
});

test('clearTicket allows a new ticket to be recorded for the same vendor/metric', () => {
  const state = createEmptyState();
  recordTicket(state, 1, 'srs_score', 42);
  clearTicket(state, 1, 'srs_score');
  expect(hasOpenTicket(state, 1, 'srs_score')).toBe(false);
});
