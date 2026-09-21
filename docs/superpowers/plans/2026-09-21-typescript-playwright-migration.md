# TypeScript + Playwright Test Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `risk-alert-triage-bot` from plain-JS Node scripts + `node --test` to a TypeScript codebase driven entirely by `@playwright/test`, with the live 5-stage automation as one `@live`-tagged spec excluded from default runs.

**Architecture:** Every `src/*.js` becomes a typed `src/*.ts` module with identical behavior. Every `tests/*.test.js` becomes a `tests/*.spec.ts` using `@playwright/test`'s `test`/`expect` instead of `node:test`/`node:assert`. The 5 automation stages (`runOnboarding`, `runAssessment`, `runSrsScoring`, `runFairAnalysis`, `main`) change to accept a Playwright `Page` (or nothing, for the API-only ticket pipeline) instead of calling `launchBrowser()` internally, so `tests/fullAutomation.spec.ts` can share one `page` fixture across all `test.step()`s.

**Tech Stack:** TypeScript, `@playwright/test`, existing `dotenv`/`nodemailer`/`playwright` deps.

**Spec:** `docs/superpowers/specs/2026-09-21-typescript-playwright-migration-design.md`

## Global Constraints

- No behavior changes to any automation logic (SRS scoring stays UI-based via `waitForScoreOnPage`; scoring thresholds `{ srs: 20, shodan: 5 }`; classification prompts; ticket/email formatting — all carry over verbatim).
- `npx playwright test` (no args) must run only non-`@live` specs.
- `npx playwright test --grep @live` runs the real end-to-end chain.
- Every existing test assertion must have a corresponding assertion after conversion — no coverage silently dropped.
- Commit after every task.

---

### Task 1: Toolchain setup + `types.ts` + `stateStore.ts` migration

**Files:**
- Modify: `package.json`
- Create: `tsconfig.json`
- Create: `playwright.config.ts`
- Create: `src/types.ts`
- Create: `src/stateStore.ts`
- Create: `tests/stateStore.spec.ts`
- Create: `tests/statePersistence.spec.ts`
- Create: `tests/ticketTracking.spec.ts`
- Create: `tests/updateScores.spec.ts`
- Delete (end of task, once specs above are green): `src/stateStore.js`, `tests/stateStore.test.js`, `tests/statePersistence.test.js`, `tests/ticketTracking.test.js`, `tests/updateScores.test.js`

**Interfaces:**
- Produces: `VendorState`, `VendorRecord`, `ScoreChange`, `Vendor`, `VendorContext`, `Classification`, `Issue`, `CreatedIssue`, `Question` (all from `src/types.ts`) — every later task imports the types it needs from here.
- Produces (from `stateStore.ts`): `loadState(filePath: string): VendorState`, `saveState(filePath: string, state: VendorState): void`, `detectScoreChanges(previous: Record<string, number> | null, current: Record<string, number>, thresholds?: { srs: number; shodan: number }): ScoreChange[]`, `createEmptyState(): VendorState`, `hasOpenTicket(state: VendorState, vendorId: number | string, metric: string): boolean`, `recordTicket(state: VendorState, vendorId: number | string, metric: string, issueNumber: number): void`, `clearTicket(state: VendorState, vendorId: number | string, metric: string): void`, `getScores(state: VendorState, vendorId: number | string): Record<string, number> | null`, `updateScores(state: VendorState, vendorId: number | string, scores: Record<string, number>): void`

- [ ] **Step 1: Install dependencies**

Run: `cd "D:\Risk Assessment" && npm install --save-dev @playwright/test typescript @types/node`

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "playwright.config.ts"]
}
```

- [ ] **Step 3: Write `playwright.config.ts`**

```ts
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

const sessionPath = path.join(process.cwd(), 'data', 'session.json');

export default defineConfig({
  testDir: 'tests',
  timeout: 120000,
  fullyParallel: false,
  grepInvert: /@live/,
  use: {
    headless: process.env.ONBOARDING_HEADLESS === 'true',
    viewport: process.env.ONBOARDING_HEADLESS === 'true' ? undefined : null,
    launchOptions: {
      args: process.env.ONBOARDING_HEADLESS === 'true' ? [] : ['--start-maximized'],
    },
    storageState: fs.existsSync(sessionPath) ? sessionPath : undefined,
    navigationTimeout: 90000,
    actionTimeout: 60000,
  },
});
```

- [ ] **Step 4: Update `package.json` test script**

Change:
```json
"scripts": {
  "test": "node --test tests/*.test.js"
},
```
to:
```json
"scripts": {
  "test": "playwright test",
  "test:live": "playwright test --grep @live"
},
```

- [ ] **Step 5: Write `src/types.ts`**

```ts
export interface VendorContext {
  vendor_name: string;
  vendor_domain: string;
}

export interface Vendor {
  id: number;
  vendor_name: string;
  vendor_domain: string;
  current_srs_score: number | null;
  current_shodan_score: number | null;
  business_impact?: string;
  pii_record_count?: number;
  spii_record_count?: number;
  sox_record_count?: number;
  [key: string]: unknown;
}

export interface ScoreChange {
  metric: string;
  previous: number;
  current: number;
  delta: number;
}

export interface Classification {
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  title: string;
  summary: string;
  recommendation: string;
}

export interface Issue {
  title: string;
  body: string;
  labels: string[];
}

export interface CreatedIssue {
  number: number;
  html_url?: string;
  [key: string]: unknown;
}

export interface Question {
  id: string;
  label: string;
  required?: boolean;
  type: 'radio' | 'select' | 'textarea' | 'number' | 'date' | 'text' | 'skip';
  options?: string[];
}

export interface VendorRecord {
  scores: Record<string, number> | null;
  tickets: Record<string, number>;
}

export interface VendorState {
  vendors: Record<string, VendorRecord>;
}
```

- [ ] **Step 6: Write the failing spec `tests/stateStore.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { detectScoreChanges } from '../src/stateStore.js';

test('returns no changes when there is no previous state', () => {
  const changes = detectScoreChanges(null, { srs_score: 756, shodan_score: 88 });
  expect(changes).toEqual([]);
});

test('returns no changes when scores are unchanged', () => {
  const prev = { srs_score: 756, shodan_score: 88 };
  const curr = { srs_score: 756, shodan_score: 88 };
  expect(detectScoreChanges(prev, curr)).toEqual([]);
});

test('returns no changes when scores improve', () => {
  const prev = { srs_score: 700, shodan_score: 80 };
  const curr = { srs_score: 756, shodan_score: 88 };
  expect(detectScoreChanges(prev, curr)).toEqual([]);
});

test('detects a significant SRS score drop', () => {
  const prev = { srs_score: 756, shodan_score: 88 };
  const curr = { srs_score: 700, shodan_score: 88 };
  const changes = detectScoreChanges(prev, curr);
  expect(changes).toEqual([{ metric: 'srs_score', previous: 756, current: 700, delta: -56 }]);
});

test('ignores an SRS score drop below the threshold', () => {
  const prev = { srs_score: 756, shodan_score: 88 };
  const curr = { srs_score: 745, shodan_score: 88 };
  expect(detectScoreChanges(prev, curr)).toEqual([]);
});

test('detects a significant Shodan score drop', () => {
  const prev = { srs_score: 756, shodan_score: 88 };
  const curr = { srs_score: 756, shodan_score: 80 };
  const changes = detectScoreChanges(prev, curr);
  expect(changes).toEqual([{ metric: 'shodan_score', previous: 88, current: 80, delta: -8 }]);
});

test('detects both metrics dropping simultaneously', () => {
  const prev = { srs_score: 756, shodan_score: 88 };
  const curr = { srs_score: 700, shodan_score: 80 };
  expect(detectScoreChanges(prev, curr).length).toBe(2);
});

test('respects custom thresholds', () => {
  const prev = { srs_score: 756, shodan_score: 88 };
  const curr = { srs_score: 745, shodan_score: 88 };
  const changes = detectScoreChanges(prev, curr, { srs: 5, shodan: 5 });
  expect(changes).toEqual([{ metric: 'srs_score', previous: 756, current: 745, delta: -11 }]);
});
```

- [ ] **Step 7: Verify it fails**

Run: `npx playwright test tests/stateStore.spec.ts`
Expected: FAIL — `src/stateStore.ts` does not exist yet (module resolution error).

- [ ] **Step 8: Write `src/stateStore.ts`**

```ts
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
```

- [ ] **Step 9: Verify `stateStore.spec.ts` passes**

Run: `npx playwright test tests/stateStore.spec.ts`
Expected: PASS (8 tests)

- [ ] **Step 10: Write and verify the remaining stateStore specs**

`tests/statePersistence.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadState, saveState, recordTicket, hasOpenTicket } from '../src/stateStore.js';

function tempFilePath(): string {
  return path.join(os.tmpdir(), `state-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

test('loadState returns an empty state when the file does not exist', () => {
  const state = loadState(tempFilePath());
  expect(state).toEqual({ vendors: {} });
});

test('saveState then loadState round-trips ticket data', () => {
  const filePath = tempFilePath();
  const state = loadState(filePath);
  recordTicket(state, 1, 'srs_score', 42);
  saveState(filePath, state);

  const reloaded = loadState(filePath);
  expect(hasOpenTicket(reloaded, 1, 'srs_score')).toBe(true);

  fs.unlinkSync(filePath);
});
```

`tests/ticketTracking.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import { createEmptyState, hasOpenTicket, recordTicket, clearTicket } from '../src/stateStore.js';

test('hasOpenTicket is false when nothing has been recorded', () => {
  const state = createEmptyState();
  expect(hasOpenTicket(state, 1, 'srs_score')).toBe(false);
});

test('hasOpenTicket is true after recordTicket for the same vendor/metric', () => {
  const state = createEmptyState();
  recordTicket(state, 1, 'srs_score', 42);
  expect(hasOpenTicket(state, 1, 'srs_score')).toBe(true);
});

test('hasOpenTicket is false for a different metric on the same vendor', () => {
  const state = createEmptyState();
  recordTicket(state, 1, 'srs_score', 42);
  expect(hasOpenTicket(state, 1, 'shodan_score')).toBe(false);
});

test('hasOpenTicket is false for a different vendor', () => {
  const state = createEmptyState();
  recordTicket(state, 1, 'srs_score', 42);
  expect(hasOpenTicket(state, 2, 'srs_score')).toBe(false);
});

test('clearTicket allows a new ticket to be recorded for the same vendor/metric', () => {
  const state = createEmptyState();
  recordTicket(state, 1, 'srs_score', 42);
  clearTicket(state, 1, 'srs_score');
  expect(hasOpenTicket(state, 1, 'srs_score')).toBe(false);
});
```

`tests/updateScores.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import { createEmptyState, updateScores, getScores } from '../src/stateStore.js';

test('getScores returns null when no scores have been recorded', () => {
  const state = createEmptyState();
  expect(getScores(state, 1)).toBeNull();
});

test('updateScores then getScores round-trips the latest scores', () => {
  const state = createEmptyState();
  updateScores(state, 1, { srs_score: 756, shodan_score: 88 });
  expect(getScores(state, 1)).toEqual({ srs_score: 756, shodan_score: 88 });
});
```

Run: `npx playwright test tests/statePersistence.spec.ts tests/ticketTracking.spec.ts tests/updateScores.spec.ts`
Expected: PASS (7 tests)

- [ ] **Step 11: Delete old files**

Run: `cd "D:\Risk Assessment" && rm src/stateStore.js tests/stateStore.test.js tests/statePersistence.test.js tests/ticketTracking.test.js tests/updateScores.test.js`

- [ ] **Step 12: Commit**

```bash
git add package.json tsconfig.json playwright.config.ts src/types.ts src/stateStore.ts tests/stateStore.spec.ts tests/statePersistence.spec.ts tests/ticketTracking.spec.ts tests/updateScores.spec.ts
git rm src/stateStore.js tests/stateStore.test.js tests/statePersistence.test.js tests/ticketTracking.test.js tests/updateScores.test.js
git commit -m "Set up TypeScript + Playwright Test toolchain; migrate stateStore"
```

---

### Task 2: `classifier.ts` migration

**Files:**
- Create: `src/classifier.ts`
- Create: `tests/classifier.spec.ts`
- Delete: `src/classifier.js`, `tests/classifier.test.js`

**Interfaces:**
- Consumes: `Vendor`, `ScoreChange`, `Classification` from `./types.js` (Task 1)
- Produces: `buildClassificationPrompt(vendor: Vendor, changes: ScoreChange[]): string`, `buildInitialRiskPrompt(vendor: Vendor): string`, `parseClassificationResponse(raw: string): Classification`

- [ ] **Step 1: Write the failing spec `tests/classifier.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { buildClassificationPrompt, parseClassificationResponse, buildInitialRiskPrompt } from '../src/classifier.js';
import type { Vendor, ScoreChange } from '../src/types.js';

const vendor: Vendor = {
  id: 1,
  vendor_name: 'First Test Vendor',
  vendor_domain: 'shopify.com',
  current_srs_score: 700,
  current_shodan_score: 88,
  business_impact: '249998.00',
  pii_record_count: 4999,
};

const changes: ScoreChange[] = [{ metric: 'srs_score', previous: 756, current: 700, delta: -56 }];

test('buildClassificationPrompt includes vendor name, domain, and the score change', () => {
  const prompt = buildClassificationPrompt(vendor, changes);
  expect(prompt).toMatch(/First Test Vendor/);
  expect(prompt).toMatch(/shopify\.com/);
  expect(prompt).toMatch(/756/);
  expect(prompt).toMatch(/700/);
});

test('buildClassificationPrompt includes business impact for financial context', () => {
  const prompt = buildClassificationPrompt(vendor, changes);
  expect(prompt).toMatch(/249998/);
});

test('parseClassificationResponse parses well-formed JSON', () => {
  const raw = JSON.stringify({
    severity: 'high',
    category: 'information_security',
    title: 'SRS score drop for First Test Vendor',
    summary: 'Security rating fell from 756 to 700.',
    recommendation: 'Request remediation plan within 30 days.',
  });
  const result = parseClassificationResponse(raw);
  expect(result.severity).toBe('high');
  expect(result.category).toBe('information_security');
  expect(result.title).toBe('SRS score drop for First Test Vendor');
});

test('parseClassificationResponse strips markdown code fences', () => {
  const raw = '```json\n' + JSON.stringify({
    severity: 'medium',
    category: 'operational',
    title: 'Test',
    summary: 'Test summary',
    recommendation: 'Test recommendation',
  }) + '\n```';
  const result = parseClassificationResponse(raw);
  expect(result.severity).toBe('medium');
});

test('parseClassificationResponse throws a clear error on invalid JSON', () => {
  expect(() => parseClassificationResponse('not json at all')).toThrow(/Failed to parse classification response/);
});

test('parseClassificationResponse throws when required fields are missing', () => {
  expect(() => parseClassificationResponse(JSON.stringify({ severity: 'high' }))).toThrow(/missing required field/);
});

const newVendor: Vendor = {
  id: 21,
  vendor_name: 'Acme QA Tools',
  vendor_domain: 'app.clokio.io',
  current_srs_score: 95,
  current_shodan_score: 82,
  business_impact: '491.00',
  pii_record_count: 400,
};

test('buildInitialRiskPrompt includes vendor name, domain, and current scores', () => {
  const prompt = buildInitialRiskPrompt(newVendor);
  expect(prompt).toMatch(/Acme QA Tools/);
  expect(prompt).toMatch(/app\.clokio\.io/);
  expect(prompt).toMatch(/95/);
  expect(prompt).toMatch(/82/);
});

test('buildInitialRiskPrompt includes business impact and PII record count', () => {
  const prompt = buildInitialRiskPrompt(newVendor);
  expect(prompt).toMatch(/491/);
  expect(prompt).toMatch(/400/);
});

test('buildInitialRiskPrompt does not describe a score change (baseline assessment, not a delta)', () => {
  const prompt = buildInitialRiskPrompt(newVendor);
  expect(prompt).not.toMatch(/delta/i);
  expect(prompt).not.toMatch(/changed/i);
});
```

- [ ] **Step 2: Verify it fails**

Run: `npx playwright test tests/classifier.spec.ts`
Expected: FAIL — `src/classifier.ts` does not exist.

- [ ] **Step 3: Write `src/classifier.ts`**

```ts
import type { Vendor, ScoreChange, Classification } from './types.js';

const REQUIRED_FIELDS: (keyof Classification)[] = ['severity', 'category', 'title', 'summary', 'recommendation'];

export function buildClassificationPrompt(vendor: Vendor, changes: ScoreChange[]): string {
  const changeLines = changes
    .map((c) => `- ${c.metric}: ${c.previous} -> ${c.current} (delta ${c.delta})`)
    .join('\n');

  return `You are a third-party risk analyst. A vendor's monitored risk scores changed.

Vendor: ${vendor.vendor_name} (${vendor.vendor_domain})
Business impact if this vendor fails or is breached: $${vendor.business_impact}
PII records exposed to this vendor: ${vendor.pii_record_count}

Score changes detected:
${changeLines}

Respond with ONLY a JSON object with these fields:
- severity: one of "low", "medium", "high", "critical"
- category: one of "information_security", "financial", "operational", "regulatory", "bsa_aml"
- title: a short ticket title (under 80 chars)
- summary: 1-2 sentence description of what changed and why it matters
- recommendation: a concrete next action for the vendor risk team`;
}

export function buildInitialRiskPrompt(vendor: Vendor): string {
  return `You are a third-party risk analyst. A new vendor has just completed onboarding and its first security ratings are in.

Vendor: ${vendor.vendor_name} (${vendor.vendor_domain})
Business impact if this vendor fails or is breached: $${vendor.business_impact}
PII records exposed to this vendor: ${vendor.pii_record_count}

Current scores:
- srs_score: ${vendor.current_srs_score}
- shodan_score: ${vendor.current_shodan_score}

Assess this vendor's baseline risk level based on these scores and business context alone (this is a first-time assessment, not a comparison to a prior score).

Respond with ONLY a JSON object with these fields:
- severity: one of "low", "medium", "high", "critical"
- category: one of "information_security", "financial", "operational", "regulatory", "bsa_aml"
- title: a short ticket title (under 80 chars)
- summary: 1-2 sentence description of this vendor's baseline risk and why it matters
- recommendation: a concrete next action for the vendor risk team`;
}

export function parseClassificationResponse(raw: string): Classification {
  const cleaned = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

  let parsed: Partial<Classification>;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse classification response: ${(err as Error).message}`);
  }

  for (const field of REQUIRED_FIELDS) {
    if (!parsed[field]) {
      throw new Error(`Classification response missing required field: ${field}`);
    }
  }

  return parsed as Classification;
}
```

- [ ] **Step 4: Verify it passes**

Run: `npx playwright test tests/classifier.spec.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Delete old files and commit**

```bash
cd "D:\Risk Assessment"
rm src/classifier.js tests/classifier.test.js
git add src/classifier.ts tests/classifier.spec.ts
git rm src/classifier.js tests/classifier.test.js
git commit -m "Migrate classifier to TypeScript/Playwright Test"
```

---

### Task 3: `fairAnalysisClassifier.ts` migration

**Files:**
- Create: `src/fairAnalysisClassifier.ts`
- Create: `tests/fairAnalysisClassifier.spec.ts`
- Delete: `src/fairAnalysisClassifier.js`, `tests/fairAnalysisClassifier.test.js`

**Interfaces:**
- Consumes: `Vendor` from `./types.js`
- Produces: `FAIR_TEXT_FIELDS: { name: string; description: string }[]`, `buildFairAnalysisPrompt(vendor: Vendor): string`, `parseFairAnalysisAnswers(raw: string): Record<string, string>`

- [ ] **Step 1: Write the failing spec `tests/fairAnalysisClassifier.spec.ts`**

```ts
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
```

- [ ] **Step 2: Verify it fails**

Run: `npx playwright test tests/fairAnalysisClassifier.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/fairAnalysisClassifier.ts`**

```ts
import type { Vendor } from './types.js';

export const FAIR_TEXT_FIELDS: { name: string; description: string }[] = [
  { name: 'msa', description: 'Master Services Agreement details' },
  { name: 'scope_of_work', description: 'Description of the work performed by the vendor' },
  { name: 'medium_of_data', description: 'Method of data transfer (cloud, on-premises, etc.)' },
  { name: 'certifications', description: "Vendor's security certifications" },
  { name: 'compliance', description: "Vendor's compliance with relevant regulations" },
  { name: 'security_governance', description: "Vendor's security governance structure and policies" },
  { name: 'incident_response_plan', description: "Vendor's plan for responding to security incidents" },
  { name: 'continuous_monitoring', description: "Vendor's continuous security monitoring program" },
  { name: 'supply_chain_risk_mgmt', description: "Vendor's third-party/supply chain risk management program" },
  { name: 'security_awareness_training', description: "Vendor's employee security awareness training program" },
  { name: 'vulnerability_management', description: "Vendor's vulnerability management program" },
  { name: 'patch_management', description: "Vendor's patch management program" },
  { name: 'access_controls', description: "Vendor's access control practices" },
  { name: 'data_encryption', description: "Vendor's data encryption practices" },
  { name: 'network_security', description: "Vendor's network security controls" },
  { name: 'vulnerability_data', description: 'Summary of vulnerability findings from external security scans' },
  { name: 'configuration_data', description: 'Summary of configuration issues found in external security scans' },
  { name: 'compliance_data', description: "Vendor's compliance certification and audit status" },
  { name: 'risk_assessment', description: 'Overall risk assessment summary combining score and findings' },
  { name: 'threat_intelligence', description: 'Relevant threat intelligence for this vendor' },
  { name: 'security_questionnaire', description: "Status of vendor's security questionnaire responses" },
  { name: 'compliance_questionnaire', description: "Status of vendor's compliance questionnaire responses" },
  { name: 'vendor_performance', description: "Assessment of vendor's performance and security posture" },
  { name: 'third_party_vendor_list', description: "Vendor's known subprocessors/technologies (e.g. CDN, cloud host)" },
  { name: 'third_party_risk_assessment', description: "Risk assessment of vendor's subprocessors" },
  { name: 'third_party_security_questionnaire', description: 'Security questionnaire status for subprocessors' },
  { name: 'third_party_compliance_questionnaire', description: 'Compliance questionnaire status for subprocessors' },
];

export function buildFairAnalysisPrompt(vendor: Vendor): string {
  const fieldLines = FAIR_TEXT_FIELDS.map((f) => `- ${f.name}: ${f.description}`).join('\n');

  return `You are a third-party risk analyst writing a FAIR (Factor Analysis of Information Risk) assessment for a vendor, based on real external security scan data.

Vendor: ${vendor.vendor_name} (${vendor.vendor_domain})
UpGuard security rating: ${vendor.current_srs_score}/950
Shodan security score: ${vendor.current_shodan_score}/100
Estimated business impact if breached: $${vendor.business_impact}
PII records: ${vendor.pii_record_count}, SPII records: ${vendor.spii_record_count}, SOX records: ${vendor.sox_record_count}

Write realistic, professional 1-3 sentence content for each of the following fields, consistent with the vendor's actual security scores above (a good UpGuard/Shodan score should read as a healthy security posture, not a concerning one):

${fieldLines}

Respond with ONLY a JSON object mapping each field name to its text content.`;
}

export function parseFairAnalysisAnswers(raw: string): Record<string, string> {
  const cleaned = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse FAIR analysis answers: ${(err as Error).message}`);
  }
}
```

- [ ] **Step 4: Verify it passes**

Run: `npx playwright test tests/fairAnalysisClassifier.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Delete old files and commit**

```bash
cd "D:\Risk Assessment"
rm src/fairAnalysisClassifier.js tests/fairAnalysisClassifier.test.js
git add src/fairAnalysisClassifier.ts tests/fairAnalysisClassifier.spec.ts
git rm src/fairAnalysisClassifier.js tests/fairAnalysisClassifier.test.js
git commit -m "Migrate fairAnalysisClassifier to TypeScript/Playwright Test"
```

---

### Task 4: `onboardingClassifier.ts` migration

**Files:**
- Create: `src/onboardingClassifier.ts`
- Create: `tests/onboardingClassifier.spec.ts`
- Delete: `src/onboardingClassifier.js`, `tests/onboardingClassifier.test.js`

**Interfaces:**
- Consumes: `VendorContext`, `Question` from `./types.js`
- Produces: `buildSectionPrompt(vendorContext: VendorContext, questions: Question[]): string`, `parseSectionAnswers(raw: string, questions: Question[]): Record<string, string | number>`

- [ ] **Step 1: Write the failing spec `tests/onboardingClassifier.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { buildSectionPrompt, parseSectionAnswers } from '../src/onboardingClassifier.js';
import type { Question, VendorContext } from '../src/types.js';

const questions: Question[] = [
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

const vendorContext: VendorContext = { vendor_name: 'Acme QA Tools', vendor_domain: 'acmeqa.example.com' };

test('buildSectionPrompt lists every question id and label', () => {
  const prompt = buildSectionPrompt(vendorContext, questions);
  expect(prompt).toMatch(/"17"/);
  expect(prompt).toMatch(/How many PII records/);
  expect(prompt).toMatch(/"21"/);
  expect(prompt).toMatch(/Yes.*No|No.*Yes/);
});

test('parseSectionAnswers returns a map keyed by question id', () => {
  const raw = JSON.stringify({ 17: 500, 21: 'Yes', 22: 'Vendor will receive customer support tickets.' });
  const answers = parseSectionAnswers(raw, questions);
  expect(answers['17']).toBe(500);
  expect(answers['21']).toBe('Yes');
});

test('parseSectionAnswers strips markdown code fences', () => {
  const raw = '```json\n' + JSON.stringify({ 17: 100, 21: 'No', 22: 'n/a' }) + '\n```';
  const answers = parseSectionAnswers(raw, questions);
  expect(answers['17']).toBe(100);
});

test('parseSectionAnswers rejects a radio answer outside its allowed options', () => {
  const raw = JSON.stringify({ 17: 100, 21: 'Maybe', 22: 'n/a' });
  expect(() => parseSectionAnswers(raw, questions)).toThrow(/invalid value for question 21/);
});
```

- [ ] **Step 2: Verify it fails**

Run: `npx playwright test tests/onboardingClassifier.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/onboardingClassifier.ts`**

```ts
import type { Question, VendorContext } from './types.js';

export function buildSectionPrompt(vendorContext: VendorContext, questions: Question[]): string {
  const questionLines = questions
    .map((q) => {
      const opts = q.options ? ` (choose one of: ${q.options.join(', ')})` : '';
      const req = q.required ? ' [required]' : '';
      return `- id ${q.id} (${q.type}${opts}${req}): ${q.label}`;
    })
    .join('\n');

  return `You are filling out a vendor risk onboarding questionnaire for a fictional test vendor, for demo purposes only.

Vendor: ${vendorContext.vendor_name} (${vendorContext.vendor_domain})

Answer each question below plausibly and consistently with a real-but-unremarkable SaaS vendor.
For "radio" questions, answer with EXACTLY one of the listed options.
For "number" questions, answer with a plain integer.
For "text"/"textarea" questions, answer with a concise 1-2 sentence answer.

Questions:
${questionLines}

Respond with ONLY a JSON object mapping each question id to its answer, e.g. {"17": 500, "21": "Yes"}.`;
}

export function parseSectionAnswers(raw: string, questions: Question[]): Record<string, string | number> {
  const cleaned = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

  let parsed: Record<string, string | number>;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse section answers: ${(err as Error).message}`);
  }

  for (const q of questions) {
    if (q.type === 'radio' && q.id in parsed && q.options && !q.options.includes(String(parsed[q.id]))) {
      throw new Error(`invalid value for question ${q.id}: "${parsed[q.id]}" not in [${q.options.join(', ')}]`);
    }
  }

  return parsed;
}
```

- [ ] **Step 4: Verify it passes**

Run: `npx playwright test tests/onboardingClassifier.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Delete old files and commit**

```bash
cd "D:\Risk Assessment"
rm src/onboardingClassifier.js tests/onboardingClassifier.test.js
git add src/onboardingClassifier.ts tests/onboardingClassifier.spec.ts
git rm src/onboardingClassifier.js tests/onboardingClassifier.test.js
git commit -m "Migrate onboardingClassifier to TypeScript/Playwright Test"
```

---

### Task 5: `githubClient.ts` migration

**Files:**
- Create: `src/githubClient.ts`
- Create: `tests/ticketFormat.spec.ts`
- Delete: `src/githubClient.js`, `tests/ticketFormat.test.js`

**Interfaces:**
- Consumes: `Vendor`, `ScoreChange`, `Classification`, `Issue`, `CreatedIssue` from `./types.js`
- Produces: `formatIssue(vendor: Vendor, changes: ScoreChange[], classification: Classification): Issue`, `formatInitialRiskIssue(vendor: Vendor, classification: Classification): Issue`, `createIssue(args: { token: string; repo: string; title: string; body: string; labels: string[] }): Promise<CreatedIssue>`, `isIssueOpen(args: { token: string; repo: string; issueNumber: number }): Promise<boolean>`

- [ ] **Step 1: Write the failing spec `tests/ticketFormat.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { formatIssue, formatInitialRiskIssue } from '../src/githubClient.js';
import type { Vendor, ScoreChange, Classification } from '../src/types.js';

const vendor: Vendor = { id: 1, vendor_name: 'First Test Vendor', vendor_domain: 'shopify.com', current_srs_score: 700, current_shodan_score: 88 };
const changes: ScoreChange[] = [{ metric: 'srs_score', previous: 756, current: 700, delta: -56 }];
const classification: Classification = {
  severity: 'high',
  category: 'information_security',
  title: 'SRS score drop for First Test Vendor',
  summary: 'Security rating fell from 756 to 700.',
  recommendation: 'Request remediation plan within 30 days.',
};

test('formatIssue uses the classification title as the issue title', () => {
  const issue = formatIssue(vendor, changes, classification);
  expect(issue.title).toBe('SRS score drop for First Test Vendor');
});

test('formatIssue body includes vendor name, domain, and score change details', () => {
  const issue = formatIssue(vendor, changes, classification);
  expect(issue.body).toMatch(/First Test Vendor/);
  expect(issue.body).toMatch(/shopify\.com/);
  expect(issue.body).toMatch(/756/);
  expect(issue.body).toMatch(/700/);
});

test('formatIssue body includes the summary and recommendation', () => {
  const issue = formatIssue(vendor, changes, classification);
  expect(issue.body).toMatch(/Security rating fell from 756 to 700\./);
  expect(issue.body).toMatch(/Request remediation plan within 30 days\./);
});

test('formatIssue produces severity and category labels', () => {
  const issue = formatIssue(vendor, changes, classification);
  expect(issue.labels).toEqual(['severity:high', 'category:information_security']);
});

const newVendor: Vendor = { id: 21, vendor_name: 'Acme QA Tools', vendor_domain: 'app.clokio.io', current_srs_score: 95, current_shodan_score: 82 };
const baselineClassification: Classification = {
  severity: 'low',
  category: 'information_security',
  title: 'Baseline risk assessment for Acme QA Tools',
  summary: 'New vendor onboarded with strong initial security ratings.',
  recommendation: 'No immediate action required; monitor for future score changes.',
};

test('formatInitialRiskIssue uses the classification title as the issue title', () => {
  const issue = formatInitialRiskIssue(newVendor, baselineClassification);
  expect(issue.title).toBe('Baseline risk assessment for Acme QA Tools');
});

test('formatInitialRiskIssue body includes vendor name, domain, and current scores', () => {
  const issue = formatInitialRiskIssue(newVendor, baselineClassification);
  expect(issue.body).toMatch(/Acme QA Tools/);
  expect(issue.body).toMatch(/app\.clokio\.io/);
  expect(issue.body).toMatch(/95/);
  expect(issue.body).toMatch(/82/);
});

test('formatInitialRiskIssue body includes the summary and recommendation', () => {
  const issue = formatInitialRiskIssue(newVendor, baselineClassification);
  expect(issue.body).toMatch(/New vendor onboarded with strong initial security ratings\./);
  expect(issue.body).toMatch(/No immediate action required; monitor for future score changes\./);
});

test('formatInitialRiskIssue produces severity and category labels', () => {
  const issue = formatInitialRiskIssue(newVendor, baselineClassification);
  expect(issue.labels).toEqual(['severity:low', 'category:information_security']);
});
```

- [ ] **Step 2: Verify it fails**

Run: `npx playwright test tests/ticketFormat.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/githubClient.ts`**

```ts
import type { Vendor, ScoreChange, Classification, Issue, CreatedIssue } from './types.js';

export function formatIssue(vendor: Vendor, changes: ScoreChange[], classification: Classification): Issue {
  const changeLines = changes
    .map((c) => `| \`${c.metric}\` | ${c.previous} | ${c.current} | ${c.delta} |`)
    .join('\n');

  const body = `## Risk Alert: ${vendor.vendor_name} (${vendor.vendor_domain})

${classification.summary}

### Score changes

| Metric | Previous | Current | Delta |
|---|---|---|---|
${changeLines}

### Recommended action

${classification.recommendation}

---
_Auto-generated by risk-alert-triage-bot from Fair TPRM vendor data._`;

  return {
    title: classification.title,
    body,
    labels: [`severity:${classification.severity}`, `category:${classification.category}`],
  };
}

export function formatInitialRiskIssue(vendor: Vendor, classification: Classification): Issue {
  const body = `## Baseline Risk Assessment: ${vendor.vendor_name} (${vendor.vendor_domain})

${classification.summary}

### Current scores

| Metric | Score |
|---|---|
| \`srs_score\` | ${vendor.current_srs_score} |
| \`shodan_score\` | ${vendor.current_shodan_score} |

### Recommended action

${classification.recommendation}

---
_Auto-generated by risk-alert-triage-bot from Fair TPRM vendor data._`;

  return {
    title: classification.title,
    body,
    labels: [`severity:${classification.severity}`, `category:${classification.category}`],
  };
}

export async function createIssue({ token, repo, title, body, labels }: { token: string; repo: string; title: string; body: string; labels: string[] }): Promise<CreatedIssue> {
  const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, body, labels }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub issue creation failed (${response.status}): ${text}`);
  }

  return response.json();
}

export async function isIssueOpen({ token, repo, issueNumber }: { token: string; repo: string; issueNumber: number }): Promise<boolean> {
  const response = await fetch(`https://api.github.com/repos/${repo}/issues/${issueNumber}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch issue #${issueNumber} (${response.status})`);
  }

  const issue = await response.json();
  return issue.state === 'open';
}
```

- [ ] **Step 4: Verify it passes**

Run: `npx playwright test tests/ticketFormat.spec.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Delete old files and commit**

```bash
cd "D:\Risk Assessment"
rm src/githubClient.js tests/ticketFormat.test.js
git add src/githubClient.ts tests/ticketFormat.spec.ts
git rm src/githubClient.js tests/ticketFormat.test.js
git commit -m "Migrate githubClient to TypeScript/Playwright Test"
```

---

### Task 6: `mailer.ts` migration

**Files:**
- Create: `src/mailer.ts`
- Create: `tests/mailer.spec.ts`
- Delete: `src/mailer.js`, `tests/mailer.test.js`

**Interfaces:**
- Consumes: `Vendor`, `CreatedIssue`, `Classification` from `./types.js`
- Produces: `buildAlertEmail(vendor: Vendor, issue: CreatedIssue, classification: Classification): { subject: string; text: string }`, `sendAlertEmail(args: { user: string; appPassword: string; to: string; vendor: Vendor; issue: CreatedIssue; classification: Classification }): Promise<unknown>`

- [ ] **Step 1: Write the failing spec `tests/mailer.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { buildAlertEmail } from '../src/mailer.js';
import type { Vendor, CreatedIssue, Classification } from '../src/types.js';

const vendor: Vendor = { id: 1, vendor_name: 'First Test Vendor', vendor_domain: 'shopify.com', current_srs_score: 700, current_shodan_score: 88 };
const issue: CreatedIssue = {
  number: 1,
  title: 'Security Score Drop: First Test Vendor SRS decreased by 44 points',
  html_url: 'https://github.com/aashis116/risk-alert-triage-bot/issues/1',
};
const classification: Classification = {
  severity: 'medium',
  category: 'information_security',
  title: 'SRS score drop',
  summary: "First Test Vendor's SRS dropped from 800 to 756.",
  recommendation: 'Request a remediation plan.',
};

test('buildAlertEmail subject includes severity and vendor name', () => {
  const email = buildAlertEmail(vendor, issue, classification);
  expect(email.subject).toMatch(/medium/i);
  expect(email.subject).toMatch(/First Test Vendor/);
});

test('buildAlertEmail body links to the GitHub issue', () => {
  const email = buildAlertEmail(vendor, issue, classification);
  expect(email.text).toMatch(/https:\/\/github\.com\/aashis116\/risk-alert-triage-bot\/issues\/1/);
});

test('buildAlertEmail body includes the summary and recommendation', () => {
  const email = buildAlertEmail(vendor, issue, classification);
  expect(email.text).toMatch(/dropped from 800 to 756/);
  expect(email.text).toMatch(/Request a remediation plan\./);
});
```

- [ ] **Step 2: Verify it fails**

Run: `npx playwright test tests/mailer.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/mailer.ts`**

```ts
import nodemailer from 'nodemailer';
import type { Vendor, CreatedIssue, Classification } from './types.js';

export function buildAlertEmail(vendor: Vendor, issue: CreatedIssue, classification: Classification): { subject: string; text: string } {
  const subject = `[${classification.severity.toUpperCase()}] Risk alert for ${vendor.vendor_name}`;

  const text = `${classification.summary}

Recommendation: ${classification.recommendation}

Category: ${classification.category}
Severity: ${classification.severity}

Full ticket: ${issue.html_url}`;

  return { subject, text };
}

export async function sendAlertEmail({ user, appPassword, to, vendor, issue, classification }: {
  user: string;
  appPassword: string;
  to: string;
  vendor: Vendor;
  issue: CreatedIssue;
  classification: Classification;
}): Promise<unknown> {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass: appPassword },
  });

  const { subject, text } = buildAlertEmail(vendor, issue, classification);

  return transporter.sendMail({ from: user, to, subject, text });
}
```

- [ ] **Step 4: Verify it passes**

Run: `npx playwright test tests/mailer.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Delete old files and commit**

```bash
cd "D:\Risk Assessment"
rm src/mailer.js tests/mailer.test.js
git add src/mailer.ts tests/mailer.spec.ts
git rm src/mailer.js tests/mailer.test.js
git commit -m "Migrate mailer to TypeScript/Playwright Test"
```

---

### Task 7: `fairtprmApi.ts` migration

**Files:**
- Create: `src/fairtprmApi.ts`
- Create: `tests/fairtprmApi.spec.ts`
- Delete: `src/fairtprmApi.js`, `tests/fairtprmApi.test.js`

**Interfaces:**
- Consumes: `Vendor` from `./types.js`, `APIRequestContext` from `@playwright/test`
- Produces: `createApiContext(args: { baseURL: string; token: string }): Promise<APIRequestContext>`, `getVendors(ctx: APIRequestContext): Promise<Vendor[]>`, `getVendor(ctx: APIRequestContext, id: number): Promise<Vendor>`

**Note:** this spec hits the live FairTPRM API (matches its current pre-migration behavior — it was already doing this under `node --test`, not a new live dependency introduced by this migration). It is NOT tagged `@live` since that tag is reserved for the browser-driven onboarding chain per the design doc; this keeps parity with today's default `npm test` behavior.

- [ ] **Step 1: Write the failing spec `tests/fairtprmApi.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import 'dotenv/config';
import { createApiContext, getVendors, getVendor } from '../src/fairtprmApi.js';

const config = {
  baseURL: process.env.FAIRTPRM_BASE_URL!,
  token: process.env.FAIRTPRM_API_TOKEN!,
};

test('getVendors returns the seeded test vendor', async () => {
  const ctx = await createApiContext(config);
  const vendors = await getVendors(ctx);
  expect(vendors.some((v) => v.vendor_name === 'First Test Vendor')).toBe(true);
  await ctx.dispose();
});

test('getVendor returns full detail including scores', async () => {
  const ctx = await createApiContext(config);
  const vendor = await getVendor(ctx, 1);
  expect(vendor.vendor_name).toBe('First Test Vendor');
  expect(typeof vendor.current_srs_score).toBe('number');
  await ctx.dispose();
});
```

- [ ] **Step 2: Verify it fails**

Run: `npx playwright test tests/fairtprmApi.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/fairtprmApi.ts`**

```ts
import { request, type APIRequestContext } from '@playwright/test';
import type { Vendor } from './types.js';

export async function createApiContext({ baseURL, token }: { baseURL: string; token: string }): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: `${baseURL}/api/v2/`,
    extraHTTPHeaders: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function getVendors(ctx: APIRequestContext): Promise<Vendor[]> {
  const response = await ctx.get('vendors');
  if (!response.ok()) {
    throw new Error(`GET /vendors failed (${response.status()})`);
  }
  const { data } = await response.json();
  return data;
}

export async function getVendor(ctx: APIRequestContext, id: number): Promise<Vendor> {
  const response = await ctx.get(`vendors/${id}`);
  if (!response.ok()) {
    throw new Error(`GET /vendors/${id} failed (${response.status()})`);
  }
  const { data } = await response.json();
  return data;
}
```

- [ ] **Step 4: Verify it passes**

Run: `npx playwright test tests/fairtprmApi.spec.ts`
Expected: PASS (2 tests) — requires `.env` to be populated (same as today).

- [ ] **Step 5: Delete old files and commit**

```bash
cd "D:\Risk Assessment"
rm src/fairtprmApi.js tests/fairtprmApi.test.js
git add src/fairtprmApi.ts tests/fairtprmApi.spec.ts
git rm src/fairtprmApi.js tests/fairtprmApi.test.js
git commit -m "Migrate fairtprmApi to TypeScript/Playwright Test"
```

---

### Task 8: `geminiClient.ts` migration

**Files:**
- Create: `src/geminiClient.ts`
- Create: `tests/geminiClient.spec.ts`
- Create: `tests/geminiRetry.spec.ts`
- Delete: `src/geminiClient.js`, `tests/geminiClient.test.js`, `tests/geminiRetry.test.js`

**Interfaces:**
- Produces: `buildGeminiUrl(apiKey: string, model?: string): string`, `buildGeminiRequestBody(prompt: string): { contents: { parts: { text: string }[] }[] }`, `callGemini(args: { apiKey: string; prompt: string; model?: string; fetchImpl?: typeof fetch; maxRetries?: number; retryDelayMs?: number }): Promise<string>`

- [ ] **Step 1: Write the failing specs**

`tests/geminiClient.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import { buildGeminiRequestBody, buildGeminiUrl } from '../src/geminiClient.js';

test('buildGeminiRequestBody wraps the prompt as content text', () => {
  const body = buildGeminiRequestBody('classify this alert');
  expect(body.contents[0].parts[0].text).toBe('classify this alert');
});

test('buildGeminiUrl defaults to a specific model', () => {
  const url = buildGeminiUrl('my-api-key');
  expect(url).toMatch(/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.6-flash:generateContent\?key=my-api-key$/);
});

test('buildGeminiUrl allows overriding the model', () => {
  const url = buildGeminiUrl('my-api-key', 'gemini-2.0-flash');
  expect(url).toMatch(/models\/gemini-2\.0-flash:generateContent/);
});
```

`tests/geminiRetry.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import { callGemini } from '../src/geminiClient.js';

function fakeResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

test('retries on a 503 and succeeds on the next attempt', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return fakeResponse(503, { error: { message: 'overloaded' } });
    return fakeResponse(200, { candidates: [{ content: { parts: [{ text: 'OK' }] } }] });
  };

  const result = await callGemini({ apiKey: 'k', prompt: 'p', fetchImpl, retryDelayMs: 1 });
  expect(result).toBe('OK');
  expect(calls).toBe(2);
});

test('gives up after the max number of retries on repeated 503s', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return fakeResponse(503, { error: { message: 'overloaded' } });
  };

  await expect(
    callGemini({ apiKey: 'k', prompt: 'p', fetchImpl, retryDelayMs: 1, maxRetries: 2 })
  ).rejects.toThrow(/Gemini API request failed \(503\)/);
  expect(calls).toBe(3);
});

test('does not retry on a non-retryable 400 error', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return fakeResponse(400, { error: { message: 'bad request' } });
  };

  await expect(
    callGemini({ apiKey: 'k', prompt: 'p', fetchImpl, retryDelayMs: 1 })
  ).rejects.toThrow(/Gemini API request failed \(400\)/);
  expect(calls).toBe(1);
});
```

- [ ] **Step 2: Verify they fail**

Run: `npx playwright test tests/geminiClient.spec.ts tests/geminiRetry.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/geminiClient.ts`**

```ts
const DEFAULT_MODEL = 'gemini-3.6-flash';

export function buildGeminiUrl(apiKey: string, model: string = DEFAULT_MODEL): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
}

export function buildGeminiRequestBody(prompt: string): { contents: { parts: { text: string }[] }[] } {
  return {
    contents: [{ parts: [{ text: prompt }] }],
  };
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callGemini({
  apiKey,
  prompt,
  model,
  fetchImpl = fetch,
  maxRetries = 3,
  retryDelayMs = 1000,
}: {
  apiKey: string;
  prompt: string;
  model?: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  retryDelayMs?: number;
}): Promise<string> {
  let attempt = 0;

  while (true) {
    const response = await fetchImpl(buildGeminiUrl(apiKey, model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildGeminiRequestBody(prompt)),
    });

    if (response.ok) {
      const data = await response.json();
      return data.candidates[0].content.parts[0].text;
    }

    const text = await response.text();
    const isRetryable = RETRYABLE_STATUSES.has(response.status);

    if (!isRetryable || attempt >= maxRetries) {
      throw new Error(`Gemini API request failed (${response.status}): ${text}`);
    }

    attempt += 1;
    await delay(retryDelayMs * 2 ** (attempt - 1));
  }
}
```

- [ ] **Step 4: Verify they pass**

Run: `npx playwright test tests/geminiClient.spec.ts tests/geminiRetry.spec.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Delete old files and commit**

```bash
cd "D:\Risk Assessment"
rm src/geminiClient.js tests/geminiClient.test.js tests/geminiRetry.test.js
git add src/geminiClient.ts tests/geminiClient.spec.ts tests/geminiRetry.spec.ts
git rm src/geminiClient.js tests/geminiClient.test.js tests/geminiRetry.test.js
git commit -m "Migrate geminiClient to TypeScript/Playwright Test"
```

---

### Task 9: `selfAnswerGenerator.ts` migration

**Files:**
- Create: `src/selfAnswerGenerator.ts`
- Create: `tests/selfAnswerGenerator.spec.ts`
- Delete: `src/selfAnswerGenerator.js`, `tests/selfAnswerGenerator.test.js`

**Interfaces:**
- Consumes: `Question` from `./types.js`
- Produces: `generateAnswer(question: Question, opts?: { seed?: number }): string | number`

- [ ] **Step 1: Write the failing spec `tests/selfAnswerGenerator.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { generateAnswer } from '../src/selfAnswerGenerator.js';
import type { Question } from '../src/types.js';

test('generateAnswer picks a value from the options list for radio questions', () => {
  const q: Question = { id: '21', label: 'Will confidential information be shared?', type: 'radio', options: ['Yes', 'No'] };
  const answer = generateAnswer(q);
  expect(['Yes', 'No']).toContain(answer);
});

test('generateAnswer picks a value from the options list for select questions', () => {
  const q: Question = { id: '5', label: 'What is the vendor type?', type: 'select', options: ['Technology', 'Legal'] };
  const answer = generateAnswer(q);
  expect(['Technology', 'Legal']).toContain(answer);
});

test('generateAnswer produces a plain integer for number questions', () => {
  const q: Question = { id: '10', label: 'How many users will use this product/service?', type: 'number' };
  const answer = generateAnswer(q) as number;
  expect(Number.isInteger(answer)).toBe(true);
  expect(answer).toBeGreaterThan(0);
});

test('generateAnswer produces an ISO date string for date-type inputs', () => {
  const q: Question = { id: '9', label: 'What is the expected procurement date?', type: 'date' };
  const answer = generateAnswer(q);
  expect(answer).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('generateAnswer produces a valid email for email-labeled questions', () => {
  const q: Question = { id: '12', label: 'What is the primary contact email?', type: 'text' };
  const answer = generateAnswer(q);
  expect(answer).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
});

test('generateAnswer produces non-empty text for a generic text question', () => {
  const q: Question = { id: '8', label: 'Who is the relationship manager for this vendor?', type: 'text' };
  const answer = generateAnswer(q);
  expect(typeof answer).toBe('string');
  expect((answer as string).length).toBeGreaterThan(0);
});

test('generateAnswer is deterministic when given a seed', () => {
  const q: Question = { id: '21', label: 'Will confidential information be shared?', type: 'radio', options: ['Yes', 'No'] };
  const a1 = generateAnswer(q, { seed: 42 });
  const a2 = generateAnswer(q, { seed: 42 });
  expect(a1).toBe(a2);
});
```

- [ ] **Step 2: Verify it fails**

Run: `npx playwright test tests/selfAnswerGenerator.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/selfAnswerGenerator.ts`**

```ts
import type { Question } from './types.js';

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function pick<T>(list: T[], rand: () => number): T {
  return list[Math.floor(rand() * list.length)];
}

const TEXT_TEMPLATES = [
  'Standard practice applies; no exceptions noted for this engagement.',
  "Managed through the vendor's existing operational processes.",
  "Handled per the vendor's standard service agreement terms.",
];

const NAME_POOL = ['Jordan Lee', 'Morgan Reyes', 'Casey Kim', 'Taylor Brooks'];

export function generateAnswer(question: Question, { seed }: { seed?: number } = {}): string | number {
  const rand = seed !== undefined ? seededRandom(seed) : Math.random;
  const label = question.label.toLowerCase();

  if (question.type === 'radio' || question.type === 'select') {
    return pick(question.options!, rand);
  }

  if (question.type === 'number') {
    return Math.floor(rand() * 500) + 1;
  }

  if (question.type === 'date') {
    const daysAhead = Math.floor(rand() * 90) + 30;
    const date = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 10);
  }

  if (label.includes('email')) {
    return 'contact@example.com';
  }

  if (label.includes('name') && !label.includes('vendor')) {
    return pick(NAME_POOL, rand);
  }

  return pick(TEXT_TEMPLATES, rand);
}
```

- [ ] **Step 4: Verify it passes**

Run: `npx playwright test tests/selfAnswerGenerator.spec.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Delete old files and commit**

```bash
cd "D:\Risk Assessment"
rm src/selfAnswerGenerator.js tests/selfAnswerGenerator.test.js
git add src/selfAnswerGenerator.ts tests/selfAnswerGenerator.spec.ts
git rm src/selfAnswerGenerator.js tests/selfAnswerGenerator.test.js
git commit -m "Migrate selfAnswerGenerator to TypeScript/Playwright Test"
```

---

### Task 10: `pipeline.ts` migration

**Files:**
- Create: `src/pipeline.ts`
- Create: `tests/pipeline.spec.ts`
- Delete: `src/pipeline.js`, `tests/pipeline.test.js`

**Interfaces:**
- Consumes: `Vendor`, `VendorState`, `Classification`, `CreatedIssue`, `Issue` from `./types.js`; `detectScoreChanges`, `hasOpenTicket`, `recordTicket`, `updateScores` from `./stateStore.js`; `formatIssue`, `formatInitialRiskIssue` from `./githubClient.js`
- Produces: `processVendor(vendor: Vendor, args: { state: VendorState; previousScores: Record<string, number> | null; classify: (vendor: Vendor, changes: any[]) => Promise<Classification>; createTicket: (issue: Issue) => Promise<CreatedIssue>; notify?: (args: { vendor: Vendor; issue: CreatedIssue; classification: Classification }) => Promise<void> }): Promise<CreatedIssue[]>`, `assessNewVendorRisk(vendor: Vendor, args: { classify: (vendor: Vendor) => Promise<Classification>; createTicket: (issue: Issue) => Promise<CreatedIssue>; notify?: (args: { vendor: Vendor; issue: CreatedIssue; classification: Classification }) => Promise<void> }): Promise<CreatedIssue>`

- [ ] **Step 1: Write the failing spec `tests/pipeline.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { processVendor, assessNewVendorRisk } from '../src/pipeline.js';
import { createEmptyState, getScores, hasOpenTicket, recordTicket } from '../src/stateStore.js';
import type { Vendor, Classification, CreatedIssue, Issue } from '../src/types.js';

const vendor: Vendor = {
  id: 1,
  vendor_name: 'First Test Vendor',
  vendor_domain: 'shopify.com',
  current_srs_score: 700,
  current_shodan_score: 88,
};

function fakeClassify(): Promise<Classification> {
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
  const created: Issue[] = [];
  const createTicket = async (issue: Issue): Promise<CreatedIssue> => {
    created.push(issue);
    return { number: 101 };
  };

  await processVendor(vendor, {
    state,
    previousScores: { srs_score: 756, shodan_score: 88 },
    classify: fakeClassify,
    createTicket,
  });

  expect(created.length).toBe(1);
  expect(hasOpenTicket(state, 1, 'srs_score')).toBe(true);
});

test('does not create a ticket when there is no significant change', async () => {
  const state = createEmptyState();
  let called = false;
  const createTicket = async (): Promise<CreatedIssue> => {
    called = true;
    return { number: 999 };
  };

  await processVendor(vendor, {
    state,
    previousScores: { srs_score: 700, shodan_score: 88 },
    classify: fakeClassify,
    createTicket,
  });

  expect(called).toBe(false);
});

test('does not create a duplicate ticket when one is already open for that metric', async () => {
  const state = createEmptyState();
  recordTicket(state, 1, 'srs_score', 55);
  let callCount = 0;
  const createTicket = async (): Promise<CreatedIssue> => {
    callCount += 1;
    return { number: 999 };
  };

  await processVendor(vendor, {
    state,
    previousScores: { srs_score: 756, shodan_score: 88 },
    classify: fakeClassify,
    createTicket,
  });

  expect(callCount).toBe(0);
});

test('always records the latest scores after processing', async () => {
  const state = createEmptyState();
  const createTicket = async (): Promise<CreatedIssue> => ({ number: 101 });

  await processVendor(vendor, {
    state,
    previousScores: { srs_score: 756, shodan_score: 88 },
    classify: fakeClassify,
    createTicket,
  });

  expect(getScores(state, 1)).toEqual({ srs_score: 700, shodan_score: 88 });
});

test('sends a notification email when a ticket is created', async () => {
  const state = createEmptyState();
  const createTicket = async (): Promise<CreatedIssue> => ({ number: 101, html_url: 'https://github.com/x/y/issues/101' });
  const notified: unknown[] = [];
  const notify = async (args: unknown) => { notified.push(args); };

  await processVendor(vendor, {
    state,
    previousScores: { srs_score: 756, shodan_score: 88 },
    classify: fakeClassify,
    createTicket,
    notify,
  });

  expect(notified.length).toBe(1);
  expect((notified[0] as { issue: CreatedIssue }).issue.number).toBe(101);
});

test('does not send a notification when no ticket is created', async () => {
  const state = createEmptyState();
  const createTicket = async (): Promise<CreatedIssue> => ({ number: 101 });
  let notifyCalled = false;
  const notify = async () => { notifyCalled = true; };

  await processVendor(vendor, {
    state,
    previousScores: { srs_score: 700, shodan_score: 88 },
    classify: fakeClassify,
    createTicket,
    notify,
  });

  expect(notifyCalled).toBe(false);
});

const newVendor: Vendor = {
  id: 21,
  vendor_name: 'Acme QA Tools',
  vendor_domain: 'app.clokio.io',
  current_srs_score: 95,
  current_shodan_score: 82,
};

function fakeInitialClassify(): Promise<Classification> {
  return Promise.resolve({
    severity: 'low',
    category: 'information_security',
    title: 'Baseline risk assessment for Acme QA Tools',
    summary: 'New vendor onboarded with strong initial security ratings.',
    recommendation: 'No immediate action required.',
  });
}

test('assessNewVendorRisk always files a ticket, regardless of severity', async () => {
  const created: Issue[] = [];
  const createTicket = async (issue: Issue): Promise<CreatedIssue> => {
    created.push(issue);
    return { number: 202 };
  };

  const result = await assessNewVendorRisk(newVendor, { classify: fakeInitialClassify, createTicket });

  expect(created.length).toBe(1);
  expect(created[0].title).toBe('Baseline risk assessment for Acme QA Tools');
  expect(result.number).toBe(202);
});

test('assessNewVendorRisk sends a notification when a ticket is created', async () => {
  const createTicket = async (): Promise<CreatedIssue> => ({ number: 202, html_url: 'https://github.com/x/y/issues/202' });
  const notified: unknown[] = [];
  const notify = async (args: unknown) => { notified.push(args); };

  await assessNewVendorRisk(newVendor, { classify: fakeInitialClassify, createTicket, notify });

  expect(notified.length).toBe(1);
  expect((notified[0] as { issue: CreatedIssue }).issue.number).toBe(202);
});

test('assessNewVendorRisk works without a notify function', async () => {
  const createTicket = async (): Promise<CreatedIssue> => ({ number: 202 });

  const result = await assessNewVendorRisk(newVendor, { classify: fakeInitialClassify, createTicket });

  expect(result.number).toBe(202);
});
```

- [ ] **Step 2: Verify it fails**

Run: `npx playwright test tests/pipeline.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/pipeline.ts`**

```ts
import {
  detectScoreChanges,
  hasOpenTicket,
  recordTicket,
  updateScores,
} from './stateStore.js';
import { formatIssue, formatInitialRiskIssue } from './githubClient.js';
import type { Vendor, VendorState, Classification, CreatedIssue, Issue, ScoreChange } from './types.js';

interface NotifyArgs {
  vendor: Vendor;
  issue: CreatedIssue;
  classification: Classification;
}

export async function processVendor(
  vendor: Vendor,
  {
    state,
    previousScores,
    classify,
    createTicket,
    notify,
    thresholds,
  }: {
    state: VendorState;
    previousScores: Record<string, number> | null;
    classify: (vendor: Vendor, changes: ScoreChange[]) => Promise<Classification>;
    createTicket: (issue: Issue) => Promise<CreatedIssue>;
    notify?: (args: NotifyArgs) => Promise<void>;
    thresholds?: { srs: number; shodan: number };
  }
): Promise<CreatedIssue[]> {
  const currentScores: Record<string, number> = {
    srs_score: vendor.current_srs_score ?? 0,
    shodan_score: vendor.current_shodan_score ?? 0,
  };

  const changes = detectScoreChanges(previousScores, currentScores, thresholds);
  const created: CreatedIssue[] = [];

  for (const change of changes) {
    if (hasOpenTicket(state, vendor.id, change.metric)) continue;

    const classification = await classify(vendor, [change]);
    const issue = formatIssue(vendor, [change], classification);
    const result = await createTicket(issue);

    recordTicket(state, vendor.id, change.metric, result.number);
    created.push(result);

    if (notify) {
      await notify({ vendor, issue: result, classification });
    }
  }

  updateScores(state, vendor.id, currentScores);
  return created;
}

export async function assessNewVendorRisk(
  vendor: Vendor,
  {
    classify,
    createTicket,
    notify,
  }: {
    classify: (vendor: Vendor) => Promise<Classification>;
    createTicket: (issue: Issue) => Promise<CreatedIssue>;
    notify?: (args: NotifyArgs) => Promise<void>;
  }
): Promise<CreatedIssue> {
  const classification = await classify(vendor);
  const issue = formatInitialRiskIssue(vendor, classification);
  const result = await createTicket(issue);

  if (notify) {
    await notify({ vendor, issue: result, classification });
  }

  return result;
}
```

- [ ] **Step 4: Verify it passes**

Run: `npx playwright test tests/pipeline.spec.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Delete old files and commit**

```bash
cd "D:\Risk Assessment"
rm src/pipeline.js tests/pipeline.test.js
git add src/pipeline.ts tests/pipeline.spec.ts
git rm src/pipeline.js tests/pipeline.test.js
git commit -m "Migrate pipeline to TypeScript/Playwright Test"
```

---

### Task 11: `browserLauncher.ts` migration (no dedicated test — used by later tasks)

**Files:**
- Create: `src/browserLauncher.ts`
- Delete: `src/browserLauncher.js`

**Interfaces:**
- Produces: `launchBrowser(): Promise<{ browser: Browser; context: BrowserContext; page: Page }>`, `saveSession(context: BrowserContext): Promise<void>`

**Note:** no test file existed for this module before the migration either (it's a thin Playwright bootstrap wrapper). No new test is introduced — this keeps parity with pre-migration coverage. It's exercised indirectly by `tests/fullAutomation.spec.ts` in Task 17.

- [ ] **Step 1: Write `src/browserLauncher.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';

const SESSION_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'session.json');

export async function launchBrowser(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  const headless = process.env.ONBOARDING_HEADLESS === 'true';
  const browser = await chromium.launch({
    headless,
    args: headless ? [] : ['--start-maximized'],
  });

  const context = await browser.newContext({
    viewport: headless ? undefined : null,
    storageState: fs.existsSync(SESSION_PATH) ? SESSION_PATH : undefined,
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(90000);
  page.setDefaultTimeout(60000);
  return { browser, context, page };
}

export async function saveSession(context: BrowserContext): Promise<void> {
  await context.storageState({ path: SESSION_PATH });
}
```

- [ ] **Step 2: Verify the project still type-checks and other specs still pass**

Run: `cd "D:\Risk Assessment" && npx tsc --noEmit && npx playwright test`
Expected: type-check passes; all specs converted so far still PASS.

- [ ] **Step 3: Delete old file and commit**

```bash
cd "D:\Risk Assessment"
rm src/browserLauncher.js
git add src/browserLauncher.ts
git rm src/browserLauncher.js
git commit -m "Migrate browserLauncher to TypeScript"
```

---

### Task 12: `onboardingAutomation.ts` migration

**Files:**
- Create: `src/onboardingAutomation.ts`
- Create: `tests/onboardingAutomation.spec.ts`
- Create: `tests/findVendorId.spec.ts`
- Delete: `src/onboardingAutomation.js`, `tests/onboardingAutomation.test.js`, `tests/findVendorId.test.js`

**Interfaces:**
- Consumes: `Page` from `@playwright/test`, `VendorContext`, `Question`, `Vendor` from `./types.js`; `saveSession` from `./browserLauncher.js`
- Produces: `login(page: Page, args: { baseURL: string; username: string; password: string }): Promise<void>`, `startVendorOnboarding(page: Page, args: { baseURL: string }): Promise<string>`, `extractQuestions(page: Page): Promise<Question[]>`, `fillSection(page: Page, questions: Question[], answers: Record<string, string | number>): Promise<void>`, `applyIdentityOverrides(answers: Record<string, string | number>, questions: Question[], vendorContext: VendorContext): Record<string, string | number>`, `findVendorId(vendors: Vendor[], vendorContext: VendorContext): number | null`, `approveVendor(page: Page, args: { baseURL: string; requestId: number }): Promise<void>`, `fillSectionUntilStable(page: Page, answerQuestions: (questions: Question[]) => Record<string, string | number>, onProgress?: (pass: number, newQuestions: Question[]) => void): Promise<void>`, `goToNextSection(page: Page): Promise<'next' | 'submitted' | 'done'>`

- [ ] **Step 1: Write the failing specs**

`tests/onboardingAutomation.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import { applyIdentityOverrides } from '../src/onboardingAutomation.js';
import type { VendorContext, Question } from '../src/types.js';

const vendorContext: VendorContext = { vendor_name: 'Acme QA Tools', vendor_domain: 'acmeqa.example.com' };

test('applyIdentityOverrides forces the legal name question to the vendor context value', () => {
  const questions: Question[] = [{ id: '1', label: "What is the vendor's legal name?", type: 'text' }];
  const answers = applyIdentityOverrides({ 1: 'Some LLM Guess Inc.' }, questions, vendorContext);
  expect(answers['1']).toBe('Acme QA Tools');
});

test('applyIdentityOverrides forces the domain question to the vendor context value', () => {
  const questions: Question[] = [{ id: '2', label: "What is the vendor's primary domain?", type: 'text' }];
  const answers = applyIdentityOverrides({ 2: 'wrongdomain.com' }, questions, vendorContext);
  expect(answers['2']).toBe('acmeqa.example.com');
});

test('applyIdentityOverrides leaves other answers untouched', () => {
  const questions: Question[] = [{ id: '3', label: 'What is the vendor type?', type: 'text' }];
  const answers = applyIdentityOverrides({ 3: 'Technology' }, questions, vendorContext);
  expect(answers['3']).toBe('Technology');
});

test('applyIdentityOverrides forces procurement onboarding to Yes so automated scoring is not blocked', () => {
  const questions: Question[] = [{ id: '4', label: 'Has this vendor completed Procurement Onboarding?', type: 'text' }];
  const answers = applyIdentityOverrides({ 4: 'No' }, questions, vendorContext);
  expect(answers['4']).toBe('Yes');
});
```

`tests/findVendorId.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import { findVendorId } from '../src/onboardingAutomation.js';
import type { VendorContext, Vendor } from '../src/types.js';

const vendorContext: VendorContext = { vendor_name: 'Acme QA Tools', vendor_domain: 'acmeqa.example.com' };

test('findVendorId matches by exact name and domain', () => {
  const vendors = [
    { id: 3, vendor_name: 'Acme QA Tools', vendor_domain: 'acmeqa.example.com' },
    { id: 1, vendor_name: 'Other Vendor', vendor_domain: 'other.com' },
  ] as Vendor[];
  expect(findVendorId(vendors, vendorContext)).toBe(3);
});

test('findVendorId picks the highest id when there are duplicates', () => {
  const vendors = [
    { id: 4, vendor_name: 'Acme QA Tools', vendor_domain: 'acmeqa.example.com' },
    { id: 9, vendor_name: 'Acme QA Tools', vendor_domain: 'acmeqa.example.com' },
    { id: 6, vendor_name: 'Acme QA Tools', vendor_domain: 'acmeqa.example.com' },
  ] as Vendor[];
  expect(findVendorId(vendors, vendorContext)).toBe(9);
});

test('findVendorId returns null when no match exists', () => {
  const vendors = [{ id: 1, vendor_name: 'Other Vendor', vendor_domain: 'other.com' }] as Vendor[];
  expect(findVendorId(vendors, vendorContext)).toBeNull();
});
```

- [ ] **Step 2: Verify they fail**

Run: `npx playwright test tests/onboardingAutomation.spec.ts tests/findVendorId.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/onboardingAutomation.ts`**

```ts
import type { Page } from '@playwright/test';
import { saveSession } from './browserLauncher.js';
import type { VendorContext, Question, Vendor } from './types.js';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function humanPause(): Promise<void> {
  return delay(150 + Math.random() * 300);
}

async function pollUntil(check: () => Promise<boolean>, { timeoutMs = 60000, intervalMs = 1000 } = {}): Promise<true> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return true;
    await delay(intervalMs);
  }
  throw new Error('Polling timed out waiting for page to be ready');
}

async function waitForQuestionsToRender(page: Page): Promise<void> {
  await pollUntil(async () => (await page.locator('.question').count()) > 0);
}

export async function login(page: Page, { baseURL, username, password }: { baseURL: string; username: string; password: string }): Promise<void> {
  await page.goto(`${baseURL}/login.php`);

  if (page.url().includes('login.php')) {
    await page.getByRole('textbox', { name: 'Username' }).fill(username);
    await humanPause();
    await page.getByRole('textbox', { name: 'Password' }).fill(password);
    await humanPause();
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForLoadState('networkidle');
  }

  await saveSession(page.context());
}

export async function startVendorOnboarding(page: Page, { baseURL }: { baseURL: string }): Promise<string> {
  await page.goto(`${baseURL}/vendor-onboarding.php`);
  await page.getByRole('button', { name: /Vendor Onboarding Request/ }).click();
  await page.waitForLoadState('networkidle');
  return page.url();
}

export async function extractQuestions(page: Page): Promise<Question[]> {
  return page.evaluate(() => {
    const humanize = (s: string) => s.replace(/\s+/g, ' ').replace(/\*\s*$/, '').trim();
    return Array.from(document.querySelectorAll('.question'))
      .map((q) => {
        const el = q as HTMLElement;
        const id = el.dataset.questionId as string;
        const label = humanize(el.querySelector('.question-label')?.textContent || '');
        const required = Boolean(el.querySelector('.required'));
        const radios = el.querySelectorAll('input[type="radio"]');
        const select = el.querySelector('select');
        const textarea = el.querySelector('textarea');
        const numberInput = el.querySelector('input[type="number"]');

        if (radios.length) {
          return { id, label, required, type: 'radio', options: Array.from(radios).map((r) => (r as HTMLInputElement).value) };
        }
        if (select) {
          return {
            id,
            label,
            required,
            type: 'select',
            options: Array.from(select.options).map((o) => o.value).filter(Boolean),
          };
        }
        if (textarea) return { id, label, required, type: 'textarea' };
        if (numberInput) return { id, label, required, type: 'number' };

        const namedInput = document.getElementById(`q_${id}`) as HTMLInputElement | null;
        if (!namedInput || namedInput.type === 'hidden') return { id, label, required, type: 'skip' };
        if (namedInput.type === 'date') return { id, label, required, type: 'date' };
        return { id, label, required, type: 'text' };
      })
      .filter((q) => q.id && q.type !== 'skip') as Question[];
  });
}

export async function fillSection(page: Page, questions: Question[], answers: Record<string, string | number>): Promise<void> {
  for (const q of questions) {
    const value = answers[q.id];
    if (value === undefined || value === null || value === '') continue;

    if (q.type === 'radio') {
      await page.locator(`label:has(input[name="responses[${q.id}]"][value="${value}"])`).click();
    } else if (q.type === 'select') {
      await page.locator(`#q_${q.id}`).selectOption(String(value));
    } else {
      await page.locator(`#q_${q.id}`).fill(String(value));
    }
    await humanPause();
  }
}

export function applyIdentityOverrides(
  answers: Record<string, string | number>,
  questions: Question[],
  vendorContext: VendorContext
): Record<string, string | number> {
  const result = { ...answers };
  for (const q of questions) {
    if (/legal name/i.test(q.label)) result[q.id] = vendorContext.vendor_name;
    if (/primary domain/i.test(q.label)) result[q.id] = vendorContext.vendor_domain;
    if (/completed Procurement Onboarding/i.test(q.label)) result[q.id] = 'Yes';
  }
  return result;
}

export function findVendorId(vendors: Vendor[], vendorContext: VendorContext): number | null {
  const matches = vendors.filter(
    (v) => v.vendor_name === vendorContext.vendor_name && v.vendor_domain === vendorContext.vendor_domain
  );
  if (matches.length === 0) return null;
  return matches.reduce((best, v) => (v.id > best.id ? v : best)).id;
}

export async function approveVendor(page: Page, { baseURL, requestId }: { baseURL: string; requestId: number }): Promise<void> {
  await page.goto(`${baseURL}/vendor-onboarding-list.php?status=draft`);
  const form = page.locator(`form:has(input[name="request_id"][value="${requestId}"])`);
  await form.getByRole('button', { name: 'Approve' }).click();
  await page.waitForLoadState('networkidle');
}

export async function fillSectionUntilStable(
  page: Page,
  answerQuestions: (questions: Question[]) => Record<string, string | number>,
  onProgress?: (pass: number, newQuestions: Question[]) => void
): Promise<void> {
  await waitForQuestionsToRender(page);
  const answeredIds = new Set<string>();

  for (let pass = 0; pass < 6; pass += 1) {
    const questions = await extractQuestions(page);
    const newQuestions = questions.filter((q) => !answeredIds.has(q.id));
    if (newQuestions.length === 0) break;

    if (onProgress) onProgress(pass, newQuestions);
    const answers = answerQuestions(newQuestions);
    await fillSection(page, newQuestions, answers);

    newQuestions.forEach((q) => answeredIds.add(q.id));
  }
}

export async function goToNextSection(page: Page): Promise<'next' | 'submitted' | 'done'> {
  const nextLink = page.getByRole('link', { name: /Next/ });
  if (await nextLink.count()) {
    const previousUrl = page.url();
    await nextLink.click();
    await page.waitForURL((url) => url.toString() !== previousUrl, { timeout: 45000 });
    await page.waitForLoadState('networkidle');
    await waitForQuestionsToRender(page);
    return 'next';
  }

  const submitButton = page.getByRole('button', { name: /Submit|Complete|Finish/ });
  if (await submitButton.count()) {
    await submitButton.click();
    await page.waitForLoadState('networkidle');
    return 'submitted';
  }

  return 'done';
}
```

- [ ] **Step 4: Verify they pass**

Run: `npx playwright test tests/onboardingAutomation.spec.ts tests/findVendorId.spec.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Delete old files and commit**

```bash
cd "D:\Risk Assessment"
rm src/onboardingAutomation.js tests/onboardingAutomation.test.js tests/findVendorId.test.js
git add src/onboardingAutomation.ts tests/onboardingAutomation.spec.ts tests/findVendorId.spec.ts
git rm src/onboardingAutomation.js tests/onboardingAutomation.test.js tests/findVendorId.test.js
git commit -m "Migrate onboardingAutomation to TypeScript/Playwright Test"
```

---

### Task 13: `assessmentAutomation.ts`, `fairAnalysisAutomation.ts`, `srsScoring.ts` migration (no dedicated tests)

**Files:**
- Create: `src/assessmentAutomation.ts`, `src/fairAnalysisAutomation.ts`, `src/srsScoring.ts`
- Delete: `src/assessmentAutomation.js`, `src/fairAnalysisAutomation.js`, `src/srsScoring.js`

**Interfaces:**
- Produces (`assessmentAutomation.ts`): `createAssessment(page: Page, args: { baseURL: string; templateName: string; vendorSearchText: string }): Promise<string>`, `uploadCertificate(page: Page, args: {...}): Promise<void>`
- Produces (`fairAnalysisAutomation.ts`): `startFairAnalysis(page: Page, args: { baseURL: string; vendorId: number }): Promise<void>`, `fillFairAnalysisForm(page: Page, answers: Record<string, string>): Promise<void>`, `submitFairAnalysis(page: Page): Promise<void>`
- Produces (`srsScoring.ts`): `triggerVendorScore(page: Page, args: { baseURL: string; vendorName: string; provider?: string }): Promise<void>`, `openScorePage(page: Page, args: { baseURL: string; vendorName: string }): Promise<void>`, `waitForScoreOnPage(page: Page, args?: { provider?: string; timeoutMs?: number; intervalMs?: number }): Promise<{ current_srs_score: number | null; srs_grade: string | null; current_shodan_score: number | null; shodan_grade: string | null }>`

**Note:** none of these three modules had dedicated test files before the migration (they're pure Playwright DOM-driving code, exercised only by the live automation). No new tests are introduced here — parity with pre-migration coverage. They're exercised by `tests/fullAutomation.spec.ts` in Task 17.

- [ ] **Step 1: Write `src/assessmentAutomation.ts`**

```ts
import type { Page } from '@playwright/test';

const TEMPLATE_IDS: Record<string, string> = {
  'AI Usage': '4',
  'ISO 27001:2022 Assessment': '1',
  'Tier 2 Vendor Assessment': '2',
};

export async function createAssessment(page: Page, { baseURL, templateName, vendorSearchText }: { baseURL: string; templateName: string; vendorSearchText: string }): Promise<string> {
  await page.goto(`${baseURL}/vendor-assessments.php`);
  await page.getByRole('button', { name: '+ New Assessment' }).click();

  const templateId = TEMPLATE_IDS[templateName];
  await page.evaluate((id) => {
    const el = document.querySelector('select[name="template_id"]') as HTMLSelectElement;
    el.value = id;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, templateId);

  await page.locator('#vendorSearch').pressSequentially(vendorSearchText, { delay: 60 });
  await page.locator('#vendorSuggestions div', { hasText: vendorSearchText }).first().click();

  await page.getByRole('button', { name: 'Create Assessment' }).click();
  await page.waitForLoadState('networkidle');

  const tokenUrl = await page.locator('code').textContent();
  return (tokenUrl ?? '').trim();
}

export async function uploadCertificate(page: Page, {
  assessmentUrl,
  certificatePath,
  expiryDate,
  submitterName,
  submitterTitle,
  submitterEmail,
  countryName,
  phoneNumber,
}: {
  assessmentUrl: string;
  certificatePath: string;
  expiryDate?: string;
  submitterName: string;
  submitterTitle: string;
  submitterEmail: string;
  countryName: string;
  phoneNumber: string;
}): Promise<void> {
  await page.goto(assessmentUrl);
  await page.getByRole('button', { name: 'Yes, Upload Certificate' }).click();

  const modal = page.locator('#modalCertificateForm');
  await page.setInputFiles('#modalCertificateFile', certificatePath);

  if (expiryDate) await modal.locator('#modalCertExpiry').fill(expiryDate);
  await modal.locator('input[name="submitter_name"]').fill(submitterName);
  await modal.locator('input[name="submitter_title"]').fill(submitterTitle);
  await modal.locator('input[name="submitter_email"]').fill(submitterEmail);

  await modal.getByRole('button', { name: 'Country dialling code' }).click();
  await modal.locator('.phone-cc.open .phone-cc-search').fill(countryName);
  await modal.getByRole('option', { name: new RegExp(countryName) }).click();
  await modal.locator('#modal_cert_phone_national').fill(phoneNumber);

  await modal.getByRole('checkbox', { name: /I certify/ }).check();

  page.once('dialog', (dialog) => dialog.accept());
  await modal.getByRole('button', { name: 'Upload Certificate' }).click();
  await page.waitForLoadState('networkidle');
}
```

- [ ] **Step 2: Write `src/fairAnalysisAutomation.ts`**

```ts
import type { Page } from '@playwright/test';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function humanPause(): Promise<void> {
  return delay(100 + Math.random() * 200);
}

export async function startFairAnalysis(page: Page, { baseURL, vendorId }: { baseURL: string; vendorId: number }): Promise<void> {
  await page.goto(`${baseURL}/fair-analysis.php?from_onboarding=${vendorId}`);
}

export async function fillFairAnalysisForm(page: Page, answers: Record<string, string>): Promise<void> {
  for (const [name, value] of Object.entries(answers)) {
    if (value === undefined || value === null || value === '') continue;
    await page.locator(`[name="${name}"]`).fill(String(value));
    await humanPause();
  }
}

export async function submitFairAnalysis(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Submit Analysis' }).click();
  await page.waitForLoadState('networkidle');
}
```

- [ ] **Step 3: Write `src/srsScoring.ts`**

```ts
import type { Page } from '@playwright/test';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function triggerVendorScore(page: Page, { baseURL, vendorName, provider = 'all' }: { baseURL: string; vendorName: string; provider?: string }): Promise<void> {
  await page.goto(`${baseURL}/vendor-srs-list.php`);
  await page.waitForLoadState('networkidle');

  page.once('dialog', (dialog) => dialog.accept());

  await page.evaluate(
    ({ vendorName, provider }) => {
      const rows = Array.from(document.querySelectorAll('tr'));
      const row = rows.find((r) => r.textContent?.includes(vendorName));
      if (!row) throw new Error(`Vendor row not found for: ${vendorName}`);
      const btn = row.querySelector(`button[name="rescore_provider"][value="${provider}"]`) as HTMLButtonElement | null;
      if (!btn) throw new Error(`Score button not found for provider: ${provider}`);
      btn.click();
    },
    { vendorName, provider }
  );

  await page.waitForLoadState('networkidle');
}

export async function openScorePage(page: Page, { baseURL, vendorName }: { baseURL: string; vendorName: string }): Promise<void> {
  await page.goto(`${baseURL}/vendor-srs-list.php`);
  await page.waitForLoadState('networkidle');

  const href = await page.evaluate((vendorName) => {
    const rows = Array.from(document.querySelectorAll('tr'));
    const row = rows.find((r) => r.textContent?.includes(vendorName));
    if (!row) throw new Error(`Vendor row not found for: ${vendorName}`);
    const link = Array.from(row.querySelectorAll('a')).find((a) => /view score/i.test(a.textContent || ''));
    if (!link) throw new Error('View Score link not found for vendor row');
    return link.getAttribute('href');
  }, vendorName);

  await page.goto(new URL(href!, baseURL).toString());
  await page.waitForLoadState('networkidle');
}

interface ScoreCard {
  value: string | null;
  grade: string | null;
  date: string | null;
}

function readScoreCards(page: Page): Promise<{ upguard: ScoreCard | null; shodan: ScoreCard | null }> {
  return page.evaluate(() => {
    function readCard(heading: string): ScoreCard | null {
      const h3 = Array.from(document.querySelectorAll('.card h3')).find((el) => el.textContent?.trim() === heading);
      if (!h3) return null;
      const card = h3.closest('.card') as HTMLElement;
      const value = card.querySelector('.score-value')?.textContent?.trim() ?? null;
      const grade = card.querySelector('.score-grade')?.textContent?.trim() ?? null;
      const date = card.querySelector('.score-date')?.textContent?.trim() ?? null;
      return { value, grade, date };
    }
    return {
      upguard: readCard('UpGuard Score'),
      shodan: readCard('SRS Scanner Score'),
    };
  });
}

function parsePercent(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = Number(value.replace('%', '').trim());
  return Number.isNaN(n) ? null : n;
}

export async function waitForScoreOnPage(
  page: Page,
  { provider = 'all', timeoutMs = 300000, intervalMs = 10000 }: { provider?: string; timeoutMs?: number; intervalMs?: number } = {}
): Promise<{ current_srs_score: number | null; srs_grade: string | null; current_shodan_score: number | null; shodan_grade: string | null }> {
  const watchUpguard = provider === 'all' || provider === 'upguard';
  const watchShodan = provider === 'all' || provider === 'shodan';

  const baseline = await readScoreCards(page);
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const cards = await readScoreCards(page);
    const upguardDone = !watchUpguard || Boolean(cards.upguard?.date && cards.upguard.date !== baseline.upguard?.date);
    const shodanDone = !watchShodan || Boolean(cards.shodan?.date && cards.shodan.date !== baseline.shodan?.date);

    if (upguardDone && shodanDone) {
      return {
        current_srs_score: parsePercent(cards.upguard?.value),
        srs_grade: cards.upguard?.grade ?? null,
        current_shodan_score: parsePercent(cards.shodan?.value),
        shodan_grade: cards.shodan?.grade ?? null,
      };
    }

    await delay(intervalMs);
    await page.reload();
    await page.waitForLoadState('networkidle');
  }

  throw new Error('Timed out waiting for score to update on the vendor score page');
}
```

- [ ] **Step 4: Type-check and run full suite so far**

Run: `cd "D:\Risk Assessment" && npx tsc --noEmit && npx playwright test`
Expected: type-check passes; all specs converted so far still PASS.

- [ ] **Step 5: Delete old files and commit**

```bash
cd "D:\Risk Assessment"
rm src/assessmentAutomation.js src/fairAnalysisAutomation.js src/srsScoring.js
git add src/assessmentAutomation.ts src/fairAnalysisAutomation.ts src/srsScoring.ts
git rm src/assessmentAutomation.js src/fairAnalysisAutomation.js src/srsScoring.js
git commit -m "Migrate assessmentAutomation, fairAnalysisAutomation, srsScoring to TypeScript"
```

---

### Task 14: `runOnboarding.ts`, `runAssessment.ts`, `runSrsScoring.ts`, `runFairAnalysis.ts`, `main.ts` migration

**Files:**
- Create: `src/runOnboarding.ts`, `src/runAssessment.ts`, `src/runSrsScoring.ts`, `src/runFairAnalysis.ts`, `src/main.ts`
- Delete: `src/runOnboarding.js`, `src/runAssessment.js`, `src/runSrsScoring.js`, `src/runFairAnalysis.js`, `src/main.js`

**Interfaces:**
- Consumes: `Page` from `@playwright/test`; everything migrated in Tasks 1-13.
- Produces: `runOnboarding(page: Page, vendorContext: VendorContext): Promise<{ url: string; status: string; vendorId: number | null }>`, `runAssessment(page: Page, args: { vendorSearchText: string; templateName?: string; certificate?: {...} }): Promise<{ tokenUrl: string; status: string }>`, `runSrsScoring(page: Page, args: { vendorName: string; vendorId: number; provider?: string }): Promise<Vendor>`, `runFairAnalysis(page: Page, args: { vendorId: number }): Promise<{ vendorId: number; url: string }>`, `main(): Promise<CreatedIssue[]>`

**Behavioral note (per the approved design):** each of these functions now accepts an existing `page` rather than calling `launchBrowser()`/`browser.close()` itself — this is what lets `tests/fullAutomation.spec.ts` share one browser context across all 5 stages. `main()` is unaffected (it's API-only, no `page`).

- [ ] **Step 1: Write `src/runOnboarding.ts`**

```ts
import type { Page } from '@playwright/test';
import {
  login,
  startVendorOnboarding,
  applyIdentityOverrides,
  fillSectionUntilStable,
  goToNextSection,
  findVendorId,
  approveVendor,
} from './onboardingAutomation.js';
import { generateAnswer } from './selfAnswerGenerator.js';
import { createApiContext, getVendors } from './fairtprmApi.js';
import type { VendorContext, Question } from './types.js';

function answerSection(questions: Question[], vendorContext: VendorContext): Record<string, string | number> {
  const answers: Record<string, string | number> = {};
  for (const q of questions) {
    answers[q.id] = generateAnswer(q);
  }
  return applyIdentityOverrides(answers, questions, vendorContext);
}

export async function runOnboarding(page: Page, vendorContext: VendorContext): Promise<{ url: string; status: string; vendorId: number | null }> {
  await login(page, {
    baseURL: process.env.FAIRTPRM_BASE_URL!,
    username: process.env.FAIRTPRM_USERNAME!,
    password: process.env.FAIRTPRM_PASSWORD!,
  });

  const url = await startVendorOnboarding(page, { baseURL: process.env.FAIRTPRM_BASE_URL! });
  console.log(`Started vendor onboarding: ${url}`);

  let status = 'next';
  let sectionNumber = 0;
  while (status === 'next') {
    console.log(`Section ${sectionNumber}: ${page.url()}`);
    await fillSectionUntilStable(
      page,
      (questions) => answerSection(questions, vendorContext),
      (pass, newQuestions) => console.log(`  pass ${pass + 1}: answering ${newQuestions.length} newly visible question(s)`)
    );
    status = await goToNextSection(page);
    console.log(`  -> after nav: ${page.url()} (status: ${status})`);
    sectionNumber += 1;
  }

  console.log(`Onboarding finished with status: ${status}`);

  const apiCtx = await createApiContext({
    baseURL: process.env.FAIRTPRM_BASE_URL!,
    token: process.env.FAIRTPRM_API_TOKEN!,
  });
  const vendors = await getVendors(apiCtx);
  const vendorId = findVendorId(vendors, vendorContext);
  await apiCtx.dispose();

  if (vendorId) {
    console.log(`Approving vendor id ${vendorId}...`);
    await approveVendor(page, { baseURL: process.env.FAIRTPRM_BASE_URL!, requestId: vendorId });
    console.log('Vendor approved.');
  } else {
    console.log('Could not find the newly created vendor to approve.');
  }

  return { url, status, vendorId };
}
```

- [ ] **Step 2: Write `src/runAssessment.ts`**

```ts
import type { Page } from '@playwright/test';
import { login, fillSectionUntilStable, goToNextSection } from './onboardingAutomation.js';
import { createAssessment, uploadCertificate } from './assessmentAutomation.js';
import { generateAnswer } from './selfAnswerGenerator.js';
import type { Question } from './types.js';

function answerQuestions(questions: Question[]): Record<string, string | number> {
  const answers: Record<string, string | number> = {};
  for (const q of questions) answers[q.id] = generateAnswer(q);
  return answers;
}

export async function runAssessment(page: Page, {
  vendorSearchText,
  templateName = 'Tier 2 Vendor Assessment',
  certificate,
}: {
  vendorSearchText: string;
  templateName?: string;
  certificate?: {
    certificatePath: string;
    expiryDate?: string;
    submitterName: string;
    submitterTitle: string;
    submitterEmail: string;
    countryName: string;
    phoneNumber: string;
  };
}): Promise<{ tokenUrl: string; status: string }> {
  await login(page, {
    baseURL: process.env.FAIRTPRM_BASE_URL!,
    username: process.env.FAIRTPRM_USERNAME!,
    password: process.env.FAIRTPRM_PASSWORD!,
  });

  const tokenUrl = await createAssessment(page, {
    baseURL: process.env.FAIRTPRM_BASE_URL!,
    templateName,
    vendorSearchText,
  });
  console.log(`Created assessment: ${tokenUrl}`);

  if (templateName === 'ISO 27001:2022 Assessment' && certificate) {
    await uploadCertificate(page, { assessmentUrl: tokenUrl, ...certificate });
    console.log('Certificate uploaded; assessment completed.');
    return { tokenUrl, status: 'completed-via-certificate' };
  }

  await page.goto(tokenUrl);

  let status = 'next';
  let sectionNumber = 0;
  while (status === 'next') {
    console.log(`Section ${sectionNumber}: ${page.url()}`);
    await fillSectionUntilStable(page, answerQuestions, (pass, newQuestions) =>
      console.log(`  pass ${pass + 1}: answering ${newQuestions.length} newly visible question(s)`)
    );
    status = await goToNextSection(page);
    console.log(`  -> after nav: ${page.url()} (status: ${status})`);
    sectionNumber += 1;
  }

  console.log(`Assessment finished with status: ${status}`);
  return { tokenUrl, status };
}
```

- [ ] **Step 3: Write `src/runSrsScoring.ts`**

```ts
import type { Page } from '@playwright/test';
import { login } from './onboardingAutomation.js';
import { triggerVendorScore, openScorePage, waitForScoreOnPage } from './srsScoring.js';
import type { Vendor } from './types.js';

export async function runSrsScoring(page: Page, { vendorName, vendorId, provider = 'all' }: { vendorName: string; vendorId: number; provider?: string }): Promise<Vendor> {
  await login(page, {
    baseURL: process.env.FAIRTPRM_BASE_URL!,
    username: process.env.FAIRTPRM_USERNAME!,
    password: process.env.FAIRTPRM_PASSWORD!,
  });

  console.log(`Triggering ${provider} score for '${vendorName}'...`);
  await triggerVendorScore(page, { baseURL: process.env.FAIRTPRM_BASE_URL!, vendorName, provider });

  console.log('Opening the vendor score page...');
  await openScorePage(page, { baseURL: process.env.FAIRTPRM_BASE_URL!, vendorName });

  console.log('Waiting for the score to update on the page...');
  const scores = await waitForScoreOnPage(page, { provider });

  console.log(`Scored: SRS=${scores.current_srs_score}, Shodan=${scores.current_shodan_score}`);
  return { id: vendorId, vendor_name: vendorName, vendor_domain: '', ...scores };
}
```

- [ ] **Step 4: Write `src/runFairAnalysis.ts`**

```ts
import type { Page } from '@playwright/test';
import { login } from './onboardingAutomation.js';
import { createApiContext, getVendor } from './fairtprmApi.js';
import { buildFairAnalysisPrompt, parseFairAnalysisAnswers } from './fairAnalysisClassifier.js';
import { callGemini } from './geminiClient.js';
import { startFairAnalysis, fillFairAnalysisForm, submitFairAnalysis } from './fairAnalysisAutomation.js';

export async function runFairAnalysis(page: Page, { vendorId }: { vendorId: number }): Promise<{ vendorId: number; url: string }> {
  const apiCtx = await createApiContext({
    baseURL: process.env.FAIRTPRM_BASE_URL!,
    token: process.env.FAIRTPRM_API_TOKEN!,
  });
  const vendor = await getVendor(apiCtx, vendorId);
  await apiCtx.dispose();

  console.log(`Generating FAIR analysis content for ${vendor.vendor_name} via Gemini...`);
  const prompt = buildFairAnalysisPrompt(vendor);
  const raw = await callGemini({ apiKey: process.env.GEMINI_API_KEY!, prompt });
  const answers = parseFairAnalysisAnswers(raw);

  await login(page, {
    baseURL: process.env.FAIRTPRM_BASE_URL!,
    username: process.env.FAIRTPRM_USERNAME!,
    password: process.env.FAIRTPRM_PASSWORD!,
  });

  await startFairAnalysis(page, { baseURL: process.env.FAIRTPRM_BASE_URL!, vendorId });
  console.log('Filling FAIR analysis form...');
  await fillFairAnalysisForm(page, answers);

  await submitFairAnalysis(page);
  console.log('FAIR analysis submitted.');

  return { vendorId, url: page.url() };
}
```

- [ ] **Step 5: Write `src/main.ts`**

```ts
import { createApiContext, getVendors, getVendor } from './fairtprmApi.js';
import { loadState, saveState, getScores } from './stateStore.js';
import { buildClassificationPrompt, parseClassificationResponse } from './classifier.js';
import { callGemini } from './geminiClient.js';
import { createIssue } from './githubClient.js';
import { sendAlertEmail } from './mailer.js';
import { processVendor } from './pipeline.js';
import type { Vendor, ScoreChange, Classification, CreatedIssue, Issue } from './types.js';
import path from 'node:path';

const STATE_PATH = path.join(process.cwd(), 'data', 'state.json');

async function classify(vendor: Vendor, changes: ScoreChange[]): Promise<Classification> {
  const prompt = buildClassificationPrompt(vendor, changes);
  const raw = await callGemini({ apiKey: process.env.GEMINI_API_KEY!, prompt });
  return parseClassificationResponse(raw);
}

async function createTicket(issue: Issue): Promise<CreatedIssue> {
  return createIssue({
    token: process.env.GITHUB_TOKEN!,
    repo: process.env.GITHUB_REPO!,
    ...issue,
  });
}

async function notify({ vendor, issue, classification }: { vendor: Vendor; issue: CreatedIssue; classification: Classification }): Promise<void> {
  await sendAlertEmail({
    user: process.env.GMAIL_USER!,
    appPassword: process.env.GMAIL_APP_PASSWORD!,
    to: process.env.ALERT_EMAIL_TO!,
    vendor,
    issue,
    classification,
  });
}

export async function main(): Promise<CreatedIssue[]> {
  const state = loadState(STATE_PATH);
  const apiCtx = await createApiContext({
    baseURL: process.env.FAIRTPRM_BASE_URL!,
    token: process.env.FAIRTPRM_API_TOKEN!,
  });

  const vendors = await getVendors(apiCtx);
  const results: CreatedIssue[] = [];

  for (const vendorSummary of vendors) {
    const vendor = await getVendor(apiCtx, vendorSummary.id);
    const previousScores = getScores(state, vendor.id);
    const created = await processVendor(vendor, { state, previousScores, classify, createTicket, notify });
    results.push(...created);
  }

  await apiCtx.dispose();
  saveState(STATE_PATH, state);
  return results;
}
```

- [ ] **Step 6: Type-check**

Run: `cd "D:\Risk Assessment" && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Delete old files and commit**

```bash
cd "D:\Risk Assessment"
rm src/runOnboarding.js src/runAssessment.js src/runSrsScoring.js src/runFairAnalysis.js src/main.js
git add src/runOnboarding.ts src/runAssessment.ts src/runSrsScoring.ts src/runFairAnalysis.ts src/main.ts
git rm src/runOnboarding.js src/runAssessment.js src/runSrsScoring.js src/runFairAnalysis.js src/main.js
git commit -m "Migrate run*/main entry points to TypeScript, accept shared page fixture"
```

---

### Task 15: `tests/fullAutomation.spec.ts` — the live end-to-end spec

**Files:**
- Create: `tests/fullAutomation.spec.ts`
- Delete: `_fullAutomation.mjs` (from the project root)

**Interfaces:**
- Consumes: `runOnboarding`, `runAssessment`, `runSrsScoring`, `runFairAnalysis` from their respective `src/*.ts` modules, `main` from `src/main.ts`.

- [ ] **Step 1: Write `tests/fullAutomation.spec.ts`**

```ts
import { test } from '@playwright/test';
import { runOnboarding } from '../src/runOnboarding.js';
import { runAssessment } from '../src/runAssessment.js';
import { runSrsScoring } from '../src/runSrsScoring.js';
import { runFairAnalysis } from '../src/runFairAnalysis.js';
import { main as runTicketPipeline } from '../src/main.js';

test('@live full vendor onboarding through ticket pipeline', async ({ page }) => {
  test.setTimeout(15 * 60 * 1000);

  const stamp = Date.now();
  const vendor_name = `Acme QA Tools ${stamp}`;
  const vendor_domain = 'app.clokio.io';

  const onboarding = await test.step('Onboarding', () => runOnboarding(page, { vendor_name, vendor_domain }));

  const vendorId: number = onboarding.vendorId ?? (() => {
    throw new Error('Onboarding did not yield a vendorId; aborting chain.');
  })();

  await test.step('Assessment', () => runAssessment(page, { vendorSearchText: vendor_name }));

  await test.step('SRS Scoring', () => runSrsScoring(page, { vendorName: vendor_name, vendorId, provider: 'all' }));

  await test.step('FAIR Analysis', () => runFairAnalysis(page, { vendorId }));

  const tickets = await test.step('Ticket Pipeline', () => runTicketPipeline());
  console.log(`Pipeline complete. ${tickets.length} ticket(s) created.`);
  tickets.forEach((t) => console.log(t.html_url));
});
```

- [ ] **Step 2: Delete `_fullAutomation.mjs` and commit**

```bash
cd "D:\Risk Assessment"
rm _fullAutomation.mjs
git add tests/fullAutomation.spec.ts
git rm _fullAutomation.mjs
git commit -m "Add fullAutomation.spec.ts (@live), retire _fullAutomation.mjs"
```

---

### Task 16: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm default run excludes the live spec**

Run: `cd "D:\Risk Assessment" && npx playwright test --list`
Expected: lists all unit specs; `fullAutomation.spec.ts`'s test is NOT listed (excluded by `grepInvert: /@live/` in `playwright.config.ts`).

- [ ] **Step 2: Run the full unit suite**

Run: `npx playwright test`
Expected: all specs from Tasks 1-10 pass (matches or exceeds the pre-migration count of 76 tests, since Task 10 added 3 new `assessNewVendorRisk` tests on top of the original 76 — expect roughly 79 tests total across all specs, excluding `@live`).

- [ ] **Step 3: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Confirm the old JS/test files are fully gone**

Run: `ls src/*.js tests/*.test.js 2>&1`
Expected: "No such file or directory" for both patterns — every file has been converted.

- [ ] **Step 5: Manually run the live spec once (real side effects — run when ready, not required to close out this plan)**

Run: `npx playwright test --grep @live`
Expected: same 5-stage behavior as the pre-migration `_fullAutomation.mjs` runs (new vendor onboarded, assessed, scored via UI, FAIR-analyzed, ticket pipeline runs clean) — subject to Gemini quota availability.

- [ ] **Step 6: Final commit**

```bash
cd "D:\Risk Assessment"
git add -A
git status
git commit -m "Complete TypeScript + Playwright Test migration" --allow-empty
```
