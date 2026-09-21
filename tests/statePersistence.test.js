import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadState, saveState, recordTicket, hasOpenTicket } from '../src/stateStore.js';

function tempFilePath() {
  return path.join(os.tmpdir(), `state-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

test('loadState returns an empty state when the file does not exist', () => {
  const state = loadState(tempFilePath());
  assert.deepEqual(state, { vendors: {} });
});

test('saveState then loadState round-trips ticket data', () => {
  const filePath = tempFilePath();
  const state = loadState(filePath);
  recordTicket(state, 1, 'srs_score', 42);
  saveState(filePath, state);

  const reloaded = loadState(filePath);
  assert.equal(hasOpenTicket(reloaded, 1, 'srs_score'), true);

  fs.unlinkSync(filePath);
});
