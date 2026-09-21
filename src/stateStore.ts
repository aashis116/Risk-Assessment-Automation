import fs from 'node:fs';
import type { VendorState, VendorRecord, ScoreChange } from './types.js';

const DEFAULT_THRESHOLDS = { srs: 20, shodan: 5 };

export function loadState(filePath: string): VendorState {
  if (!fs.existsSync(filePath)) return createEmptyState();
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function saveState(filePath: string, state: VendorState): void {
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

export function detectScoreChanges(
  previous: Record<string, number> | null,
  current: Record<string, number>,
  thresholds: { srs: number; shodan: number } = DEFAULT_THRESHOLDS
): ScoreChange[] {
  if (!previous) return [];

  const changes: ScoreChange[] = [];
  const checks: [string, number][] = [
    ['srs_score', thresholds.srs],
    ['shodan_score', thresholds.shodan],
  ];
  for (const [metric, threshold] of checks) {
    const delta = current[metric] - previous[metric];
    if (delta <= -threshold) {
      changes.push({ metric, previous: previous[metric], current: current[metric], delta });
    }
  }
  return changes;
}

export function createEmptyState(): VendorState {
  return { vendors: {} };
}

function getVendorRecord(state: VendorState, vendorId: number | string): VendorRecord {
  if (!state.vendors[vendorId]) {
    state.vendors[vendorId] = { scores: null, tickets: {} };
  }
  return state.vendors[vendorId];
}

export function hasOpenTicket(state: VendorState, vendorId: number | string, metric: string): boolean {
  return Boolean(state.vendors[vendorId]?.tickets?.[metric]);
}

export function recordTicket(state: VendorState, vendorId: number | string, metric: string, issueNumber: number): void {
  getVendorRecord(state, vendorId).tickets[metric] = issueNumber;
}

export function clearTicket(state: VendorState, vendorId: number | string, metric: string): void {
  delete getVendorRecord(state, vendorId).tickets[metric];
}

export function getScores(state: VendorState, vendorId: number | string): Record<string, number> | null {
  return state.vendors[vendorId]?.scores ?? null;
}

export function updateScores(state: VendorState, vendorId: number | string, scores: Record<string, number>): void {
  getVendorRecord(state, vendorId).scores = scores;
}
