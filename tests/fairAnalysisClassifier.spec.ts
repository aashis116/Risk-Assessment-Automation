import { test, expect } from '@playwright/test';
import { FAIR_TEXT_FIELDS, buildFairAnalysisPrompt, parseFairAnalysisAnswers } from '../src/fairAnalysisClassifier.js';
import type { Vendor } from '../src/types.js';

const vendor: Vendor = {
  id: 1,
  vendor_name: 'Northwind Retail Systems',
  vendor_domain: 'shopify.com',
  current_srs_score: 756,
  current_shodan_score: 88,
  business_impact: '287.00',
  pii_record_count: 452,
  spii_record_count: 10,
  sox_record_count: 485,
};

test('buildFairAnalysisPrompt includes real vendor scores and identity', () => {
  const prompt = buildFairAnalysisPrompt(vendor);
  expect(prompt).toMatch(/Northwind Retail Systems/);
  expect(prompt).toMatch(/shopify\.com/);
  expect(prompt).toMatch(/756/);
  expect(prompt).toMatch(/88/);
});

test('buildFairAnalysisPrompt lists every target field name', () => {
  const prompt = buildFairAnalysisPrompt(vendor);
  for (const field of FAIR_TEXT_FIELDS) {
    expect(prompt).toMatch(new RegExp(field.name));
  }
});

test('parseFairAnalysisAnswers returns a map with all expected fields', () => {
  const raw = JSON.stringify(
    Object.fromEntries(FAIR_TEXT_FIELDS.map((f) => [f.name, `sample text for ${f.name}`]))
  );
  const answers = parseFairAnalysisAnswers(raw);
  expect(answers.msa).toBe('sample text for msa');
  expect(answers.network_security).toBe('sample text for network_security');
});

test('parseFairAnalysisAnswers strips markdown code fences', () => {
  const raw = '```json\n' + JSON.stringify({ msa: 'test' }) + '\n```';
  const answers = parseFairAnalysisAnswers(raw);
  expect(answers.msa).toBe('test');
});
