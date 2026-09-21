import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeminiRequestBody, buildGeminiUrl } from '../src/geminiClient.js';

test('buildGeminiRequestBody wraps the prompt as content text', () => {
  const body = buildGeminiRequestBody('classify this alert');
  assert.equal(body.contents[0].parts[0].text, 'classify this alert');
});

test('buildGeminiUrl defaults to a specific model', () => {
  const url = buildGeminiUrl('my-api-key');
  assert.match(url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.6-flash:generateContent\?key=my-api-key$/);
});

test('buildGeminiUrl allows overriding the model', () => {
  const url = buildGeminiUrl('my-api-key', 'gemini-2.0-flash');
  assert.match(url, /models\/gemini-2\.0-flash:generateContent/);
});
