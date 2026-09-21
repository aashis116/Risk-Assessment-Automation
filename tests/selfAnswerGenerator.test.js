import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateAnswer } from '../src/selfAnswerGenerator.js';

test('generateAnswer picks a value from the options list for radio questions', () => {
  const q = { id: '21', label: 'Will confidential information be shared?', type: 'radio', options: ['Yes', 'No'] };
  const answer = generateAnswer(q);
  assert.ok(['Yes', 'No'].includes(answer));
});

test('generateAnswer picks a value from the options list for select questions', () => {
  const q = { id: '5', label: 'What is the vendor type?', type: 'select', options: ['Technology', 'Legal'] };
  const answer = generateAnswer(q);
  assert.ok(['Technology', 'Legal'].includes(answer));
});

test('generateAnswer produces a plain integer for number questions', () => {
  const q = { id: '10', label: 'How many users will use this product/service?', type: 'number' };
  const answer = generateAnswer(q);
  assert.equal(Number.isInteger(answer), true);
  assert.ok(answer > 0);
});

test('generateAnswer produces an ISO date string for date-type inputs', () => {
  const q = { id: '9', label: 'What is the expected procurement date?', type: 'date' };
  const answer = generateAnswer(q);
  assert.match(answer, /^\d{4}-\d{2}-\d{2}$/);
});

test('generateAnswer produces a valid email for email-labeled questions', () => {
  const q = { id: '12', label: 'What is the primary contact email?', type: 'text' };
  const answer = generateAnswer(q);
  assert.match(answer, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
});

test('generateAnswer produces non-empty text for a generic text question', () => {
  const q = { id: '8', label: 'Who is the relationship manager for this vendor?', type: 'text' };
  const answer = generateAnswer(q);
  assert.equal(typeof answer, 'string');
  assert.ok(answer.length > 0);
});

test('generateAnswer is deterministic when given a seed', () => {
  const q = { id: '21', label: 'Will confidential information be shared?', type: 'radio', options: ['Yes', 'No'] };
  const a1 = generateAnswer(q, { seed: 42 });
  const a2 = generateAnswer(q, { seed: 42 });
  assert.equal(a1, a2);
});
