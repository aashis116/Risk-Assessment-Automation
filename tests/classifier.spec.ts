import { test, expect } from '@playwright/test';
import { buildClassificationPrompt, parseClassificationResponse, buildInitialRiskPrompt } from '../src/classifier.js';
import type { Vendor, ScoreChange } from '../src/types.js';

const vendor: Vendor = {
  id: 1,
  vendor_name: 'First Test Vendor',
  vendor_domain: 'shopify.com',
  current_srs_score: 700,
  current_shodan_score: 88,
  business_impact: '249998.00',
  pii_record_count: 4999,
};

const changes: ScoreChange[] = [{ metric: 'srs_score', previous: 756, current: 700, delta: -56 }];

test('buildClassificationPrompt includes vendor name, domain, and the score change', () => {
  const prompt = buildClassificationPrompt(vendor, changes);
  expect(prompt).toMatch(/First Test Vendor/);
  expect(prompt).toMatch(/shopify\.com/);
  expect(prompt).toMatch(/756/);
  expect(prompt).toMatch(/700/);
});

test('buildClassificationPrompt includes business impact for financial context', () => {
  const prompt = buildClassificationPrompt(vendor, changes);
  expect(prompt).toMatch(/249998/);
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
  expect(result.severity).toBe('high');
  expect(result.category).toBe('information_security');
  expect(result.title).toBe('SRS score drop for First Test Vendor');
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
  expect(result.severity).toBe('medium');
});

test('parseClassificationResponse throws a clear error on invalid JSON', () => {
  expect(() => parseClassificationResponse('not json at all')).toThrow(/Failed to parse classification response/);
});

test('parseClassificationResponse throws when required fields are missing', () => {
  expect(() => parseClassificationResponse(JSON.stringify({ severity: 'high' }))).toThrow(/missing required field/);
});

const newVendor: Vendor = {
  id: 21,
  vendor_name: 'Acme QA Tools',
  vendor_domain: 'app.clokio.io',
  current_srs_score: 95,
  current_shodan_score: 82,
  business_impact: '491.00',
  pii_record_count: 400,
};

test('buildInitialRiskPrompt includes vendor name, domain, and current scores', () => {
  const prompt = buildInitialRiskPrompt(newVendor);
  expect(prompt).toMatch(/Acme QA Tools/);
  expect(prompt).toMatch(/app\.clokio\.io/);
  expect(prompt).toMatch(/95/);
  expect(prompt).toMatch(/82/);
});

test('buildInitialRiskPrompt includes business impact and PII record count', () => {
  const prompt = buildInitialRiskPrompt(newVendor);
  expect(prompt).toMatch(/491/);
  expect(prompt).toMatch(/400/);
});

test('buildInitialRiskPrompt does not describe a score change (baseline assessment, not a delta)', () => {
  const prompt = buildInitialRiskPrompt(newVendor);
  expect(prompt).not.toMatch(/delta/i);
  expect(prompt).not.toMatch(/changed/i);
});
