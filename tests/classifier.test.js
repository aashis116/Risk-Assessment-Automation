import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClassificationPrompt, parseClassificationResponse } from '../src/classifier.js';

const vendor = {
  id: 1,
  vendor_name: 'First Test Vendor',
  vendor_domain: 'shopify.com',
  business_impact: '249998.00',
  pii_record_count: 4999,
};

const changes = [
  { metric: 'srs_score', previous: 756, current: 700, delta: -56 },
];

test('buildClassificationPrompt includes vendor name, domain, and the score change', () => {
  const prompt = buildClassificationPrompt(vendor, changes);
  assert.match(prompt, /First Test Vendor/);
  assert.match(prompt, /shopify\.com/);
  assert.match(prompt, /756/);
  assert.match(prompt, /700/);
});

test('buildClassificationPrompt includes business impact for financial context', () => {
  const prompt = buildClassificationPrompt(vendor, changes);
  assert.match(prompt, /249998/);
});

test('parseClassificationResponse parses well-formed JSON', () => {
  const raw = JSON.stringify({
    severity: 'high',
    category: 'information_security',
    title: 'SRS score drop for First Test Vendor',
    summary: 'Security rating fell from 756 to 700.',
    recommendation: 'Request remediation plan within 30 days.',
  });
  const result = parseClassificationResponse(raw);
  assert.equal(result.severity, 'high');
  assert.equal(result.category, 'information_security');
  assert.equal(result.title, 'SRS score drop for First Test Vendor');
});

test('parseClassificationResponse strips markdown code fences', () => {
  const raw = '```json\n' + JSON.stringify({
    severity: 'medium',
    category: 'operational',
    title: 'Test',
    summary: 'Test summary',
    recommendation: 'Test recommendation',
  }) + '\n```';
  const result = parseClassificationResponse(raw);
  assert.equal(result.severity, 'medium');
});

test('parseClassificationResponse throws a clear error on invalid JSON', () => {
  assert.throws(
    () => parseClassificationResponse('not json at all'),
    /Failed to parse classification response/
  );
});

test('parseClassificationResponse throws when required fields are missing', () => {
  assert.throws(
    () => parseClassificationResponse(JSON.stringify({ severity: 'high' })),
    /missing required field/
  );
});
