import fs from 'node:fs';

const DEFAULT_THRESHOLDS = { srs: 20, shodan: 5 };

export function loadState(filePath) {
  if (!fs.existsSync(filePath)) return createEmptyState();
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function saveState(filePath, state) {
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

export function detectScoreChanges(previous, current, thresholds = DEFAULT_THRESHOLDS) {
  if (!previous) return [];

  const changes = [];
  for (const [metric, threshold] of [
    ['srs_score', thresholds.srs],
    ['shodan_score', thresholds.shodan],
  ]) {
    const delta = current[metric] - previous[metric];
    if (delta <= -threshold) {
      changes.push({ metric, previous: previous[metric], current: current[metric], delta });
    }
  }
  return changes;
}

export function createEmptyState() {
  return { vendors: {} };
}

function getVendorRecord(state, vendorId) {
  if (!state.vendors[vendorId]) {
    state.vendors[vendorId] = { scores: null, tickets: {} };
  }
  return state.vendors[vendorId];
}

export function hasOpenTicket(state, vendorId, metric) {
  return Boolean(state.vendors[vendorId]?.tickets?.[metric]);
}

export function recordTicket(state, vendorId, metric, issueNumber) {
  getVendorRecord(state, vendorId).tickets[metric] = issueNumber;
}

export function clearTicket(state, vendorId, metric) {
  delete getVendorRecord(state, vendorId).tickets[metric];
}

export function getScores(state, vendorId) {
  return state.vendors[vendorId]?.scores ?? null;
}

export function updateScores(state, vendorId, scores) {
  getVendorRecord(state, vendorId).scores = scores;
}
