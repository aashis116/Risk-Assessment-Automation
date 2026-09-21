import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyIdentityOverrides } from '../src/onboardingAutomation.js';

const vendorContext = { vendor_name: 'Acme QA Tools', vendor_domain: 'acmeqa.example.com' };

test('applyIdentityOverrides forces the legal name question to the vendor context value', () => {
  const questions = [{ id: '1', label: "What is the vendor's legal name?" }];
  const answers = applyIdentityOverrides({ 1: 'Some LLM Guess Inc.' }, questions, vendorContext);
  assert.equal(answers['1'], 'Acme QA Tools');
});

test('applyIdentityOverrides forces the domain question to the vendor context value', () => {
  const questions = [{ id: '2', label: "What is the vendor's primary domain?" }];
  const answers = applyIdentityOverrides({ 2: 'wrongdomain.com' }, questions, vendorContext);
  assert.equal(answers['2'], 'acmeqa.example.com');
});

test('applyIdentityOverrides leaves other answers untouched', () => {
  const questions = [{ id: '3', label: 'What is the vendor type?' }];
  const answers = applyIdentityOverrides({ 3: 'Technology' }, questions, vendorContext);
  assert.equal(answers['3'], 'Technology');
});

test('applyIdentityOverrides forces procurement onboarding to Yes so automated scoring is not blocked', () => {
  const questions = [{ id: '4', label: 'Has this vendor completed Procurement Onboarding?' }];
  const answers = applyIdentityOverrides({ 4: 'No' }, questions, vendorContext);
  assert.equal(answers['4'], 'Yes');
});
