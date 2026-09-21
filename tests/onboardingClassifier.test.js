import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSectionPrompt, parseSectionAnswers } from '../src/onboardingClassifier.js';

const questions = [
  { id: '17', label: 'How many PII records will this vendor handle?', type: 'number', required: false },
  {
    id: '21',
    label: 'Will confidential information be shared with this vendor?',
    type: 'radio',
    options: ['Yes', 'No'],
    required: true,
  },
  { id: '22', label: 'Describe the confidential information to be shared.', type: 'textarea', required: false },
];

const vendorContext = { vendor_name: 'Acme QA Tools', vendor_domain: 'acmeqa.example.com' };

test('buildSectionPrompt lists every question id and label', () => {
  const prompt = buildSectionPrompt(vendorContext, questions);
  assert.match(prompt, /"17"/);
  assert.match(prompt, /How many PII records/);
  assert.match(prompt, /"21"/);
  assert.match(prompt, /Yes.*No|No.*Yes/);
});

test('parseSectionAnswers returns a map keyed by question id', () => {
  const raw = JSON.stringify({ 17: 500, 21: 'Yes', 22: 'Vendor will receive customer support tickets.' });
  const answers = parseSectionAnswers(raw, questions);
  assert.equal(answers['17'], 500);
  assert.equal(answers['21'], 'Yes');
});

test('parseSectionAnswers strips markdown code fences', () => {
  const raw = '```json\n' + JSON.stringify({ 17: 100, 21: 'No', 22: 'n/a' }) + '\n```';
  const answers = parseSectionAnswers(raw, questions);
  assert.equal(answers['17'], 100);
});

test('parseSectionAnswers rejects a radio answer outside its allowed options', () => {
  const raw = JSON.stringify({ 17: 100, 21: 'Maybe', 22: 'n/a' });
  assert.throws(() => parseSectionAnswers(raw, questions), /invalid value for question 21/);
});
