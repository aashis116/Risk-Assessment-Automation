import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAlertEmail } from '../src/mailer.js';

const vendor = { id: 1, vendor_name: 'First Test Vendor', vendor_domain: 'shopify.com' };
const issue = {
  title: 'Security Score Drop: First Test Vendor SRS decreased by 44 points',
  html_url: 'https://github.com/aashis116/risk-alert-triage-bot/issues/1',
};
const classification = {
  severity: 'medium',
  category: 'information_security',
  summary: "First Test Vendor's SRS dropped from 800 to 756.",
  recommendation: 'Request a remediation plan.',
};

test('buildAlertEmail subject includes severity and vendor name', () => {
  const email = buildAlertEmail(vendor, issue, classification);
  assert.match(email.subject, /medium/i);
  assert.match(email.subject, /First Test Vendor/);
});

test('buildAlertEmail body links to the GitHub issue', () => {
  const email = buildAlertEmail(vendor, issue, classification);
  assert.match(email.text, /https:\/\/github\.com\/aashis116\/risk-alert-triage-bot\/issues\/1/);
});

test('buildAlertEmail body includes the summary and recommendation', () => {
  const email = buildAlertEmail(vendor, issue, classification);
  assert.match(email.text, /dropped from 800 to 756/);
  assert.match(email.text, /Request a remediation plan\./);
});
