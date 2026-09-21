import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processVendor } from '../src/pipeline.js';
import { createEmptyState, getScores, hasOpenTicket, recordTicket } from '../src/stateStore.js';

const vendor = {
  id: 1,
  vendor_name: 'First Test Vendor',
  vendor_domain: 'shopify.com',
  current_srs_score: 700,
  current_shodan_score: 88,
};

function fakeClassify() {
  return Promise.resolve({
    severity: 'high',
    category: 'information_security',
    title: 'SRS score drop',
    summary: 'Score fell.',
    recommendation: 'Investigate.',
  });
}

test('creates a ticket when a significant score drop is detected', async () => {
  const state = createEmptyState();
  const created = [];
  const createTicket = async (issue) => {
    created.push(issue);
    return { number: 101 };
  };

  await processVendor(vendor, {
    state,
    previousScores: { srs_score: 756, shodan_score: 88 },
    classify: fakeClassify,
    createTicket,
  });

  assert.equal(created.length, 1);
  assert.equal(hasOpenTicket(state, 1, 'srs_score'), true);
});

test('does not create a ticket when there is no significant change', async () => {
  const state = createEmptyState();
  let called = false;
  const createTicket = async () => {
    called = true;
    return { number: 999 };
  };

  await processVendor(vendor, {
    state,
    previousScores: { srs_score: 700, shodan_score: 88 },
    classify: fakeClassify,
    createTicket,
  });

  assert.equal(called, false);
});

test('does not create a duplicate ticket when one is already open for that metric', async () => {
  const state = createEmptyState();
  recordTicket(state, 1, 'srs_score', 55);
  let callCount = 0;
  const createTicket = async () => {
    callCount += 1;
    return { number: 999 };
  };

  await processVendor(vendor, {
    state,
    previousScores: { srs_score: 756, shodan_score: 88 },
    classify: fakeClassify,
    createTicket,
  });

  assert.equal(callCount, 0);
});

test('always records the latest scores after processing', async () => {
  const state = createEmptyState();
  const createTicket = async () => ({ number: 101 });

  await processVendor(vendor, {
    state,
    previousScores: { srs_score: 756, shodan_score: 88 },
    classify: fakeClassify,
    createTicket,
  });

  assert.deepEqual(getScores(state, 1), { srs_score: 700, shodan_score: 88 });
});

test('sends a notification email when a ticket is created', async () => {
  const state = createEmptyState();
  const createTicket = async () => ({ number: 101, html_url: 'https://github.com/x/y/issues/101' });
  const notified = [];
  const notify = async (args) => notified.push(args);

  await processVendor(vendor, {
    state,
    previousScores: { srs_score: 756, shodan_score: 88 },
    classify: fakeClassify,
    createTicket,
    notify,
  });

  assert.equal(notified.length, 1);
  assert.equal(notified[0].issue.number, 101);
});

test('does not send a notification when no ticket is created', async () => {
  const state = createEmptyState();
  const createTicket = async () => ({ number: 101 });
  let notifyCalled = false;
  const notify = async () => { notifyCalled = true; };

  await processVendor(vendor, {
    state,
    previousScores: { srs_score: 700, shodan_score: 88 },
    classify: fakeClassify,
    createTicket,
    notify,
  });

  assert.equal(notifyCalled, false);
});
