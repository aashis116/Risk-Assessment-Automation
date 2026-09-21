import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadState, saveState, recordTicket, hasOpenTicket } from '../src/stateStore.js';

function tempFilePath(): string {
  return path.join(os.tmpdir(), `state-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

test('loadState returns an empty state when the file does not exist', () => {
  const state = loadState(tempFilePath());
  expect(state).toEqual({ vendors: {} });
});

test('saveState then loadState round-trips ticket data', () => {
  const filePath = tempFilePath();
  const state = loadState(filePath);
  recordTicket(state, 1, 'srs_score', 42);
  saveState(filePath, state);

  const reloaded = loadState(filePath);
  expect(hasOpenTicket(reloaded, 1, 'srs_score')).toBe(true);

  fs.unlinkSync(filePath);
});
