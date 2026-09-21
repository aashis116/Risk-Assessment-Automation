import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAIR_TEXT_FIELDS, buildFairAnalysisPrompt, parseFairAnalysisAnswers } from '../src/fairAnalysisClassifier.js';

const vendor = {
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
  assert.match(prompt, /Northwind Retail Systems/);
  assert.match(prompt, /shopify\.com/);
  assert.match(prompt, /756/);
  assert.match(prompt, /88/);
});

test('buildFairAnalysisPrompt lists every target field name', () => {
  const prompt = buildFairAnalysisPrompt(vendor);
  for (const field of FAIR_TEXT_FIELDS) {
    assert.match(prompt, new RegExp(field.name));
  }
});

test('parseFairAnalysisAnswers returns a map with all expected fields', () => {
  const raw = JSON.stringify(
    Object.fromEntries(FAIR_TEXT_FIELDS.map((f) => [f.name, `sample text for ${f.name}`]))
  );
  const answers = parseFairAnalysisAnswers(raw);
  assert.equal(answers.msa, 'sample text for msa');
  assert.equal(answers.network_security, 'sample text for network_security');
});

test('parseFairAnalysisAnswers strips markdown code fences', () => {
  const raw = '```json\n' + JSON.stringify({ msa: 'test' }) + '\n```';
  const answers = parseFairAnalysisAnswers(raw);
  assert.equal(answers.msa, 'test');
});
