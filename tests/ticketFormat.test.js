import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatIssue } from '../src/githubClient.js';

const vendor = { id: 1, vendor_name: 'First Test Vendor', vendor_domain: 'shopify.com' };
const changes = [{ metric: 'srs_score', previous: 756, current: 700, delta: -56 }];
const classification = {
  severity: 'high',
  category: 'information_security',
  title: 'SRS score drop for First Test Vendor',
  summary: 'Security rating fell from 756 to 700.',
  recommendation: 'Request remediation plan within 30 days.',
};

test('formatIssue uses the classification title as the issue title', () => {
  const issue = formatIssue(vendor, changes, classification);
  assert.equal(issue.title, 'SRS score drop for First Test Vendor');
});

test('formatIssue body includes vendor name, domain, and score change details', () => {
  const issue = formatIssue(vendor, changes, classification);
  assert.match(issue.body, /First Test Vendor/);
  assert.match(issue.body, /shopify\.com/);
  assert.match(issue.body, /756/);
  assert.match(issue.body, /700/);
});

test('formatIssue body includes the summary and recommendation', () => {
  const issue = formatIssue(vendor, changes, classification);
  assert.match(issue.body, /Security rating fell from 756 to 700\./);
  assert.match(issue.body, /Request remediation plan within 30 days\./);
});

test('formatIssue produces severity and category labels', () => {
  const issue = formatIssue(vendor, changes, classification);
  assert.deepEqual(issue.labels, ['severity:high', 'category:information_security']);
});
