import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callGemini } from '../src/geminiClient.js';

function fakeResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

test('retries on a 503 and succeeds on the next attempt', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return fakeResponse(503, { error: { message: 'overloaded' } });
    return fakeResponse(200, { candidates: [{ content: { parts: [{ text: 'OK' }] } }] });
  };

  const result = await callGemini({ apiKey: 'k', prompt: 'p', fetchImpl, retryDelayMs: 1 });
  assert.equal(result, 'OK');
  assert.equal(calls, 2);
});

test('gives up after the max number of retries on repeated 503s', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return fakeResponse(503, { error: { message: 'overloaded' } });
  };

  await assert.rejects(
    () => callGemini({ apiKey: 'k', prompt: 'p', fetchImpl, retryDelayMs: 1, maxRetries: 2 }),
    /Gemini API request failed \(503\)/
  );
  assert.equal(calls, 3);
});

test('does not retry on a non-retryable 400 error', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return fakeResponse(400, { error: { message: 'bad request' } });
  };

  await assert.rejects(
    () => callGemini({ apiKey: 'k', prompt: 'p', fetchImpl, retryDelayMs: 1 }),
    /Gemini API request failed \(400\)/
  );
  assert.equal(calls, 1);
});
