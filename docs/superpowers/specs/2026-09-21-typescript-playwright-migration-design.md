# TypeScript + Playwright Test Migration

**Date:** 2026-09-21
**Status:** Approved for implementation

## Context

`risk-alert-triage-bot` currently drives browser automation with the `playwright`
library directly (manual `chromium.launch()` / `browser.close()` per script) and
runs its unit tests with Node's built-in test runner (`node --test tests/*.test.js`).
The full end-to-end chain (onboarding → assessment → SRS scoring → FAIR analysis →
ticket pipeline) is currently orchestrated by an ad-hoc script (`_fullAutomation.mjs`)
at the project root, invoked with plain `node`.

The user's standing preference is to always do web automation with Playwright's own
test runner, in TypeScript — not hand-rolled Node scripts. This migration brings the
project in line with that, without changing any of its existing behavior (UI-driven
SRS scoring, the score-drop ticket pipeline, and the new baseline `assessNewVendorRisk`
feature all carry over unchanged).

## Goals

- `npx playwright test` becomes the single way to run everything in this repo.
- All of `src/` converts to typed TypeScript.
- All existing unit tests convert 1:1 to Playwright's `test`/`expect`, preserving
  their behavior and fakes exactly.
- The 5-stage automation becomes one Playwright spec using `test.step()`, sharing a
  single browser `page` across stages via Playwright's own fixtures (no more manual
  `launchBrowser()`/`browser.close()` per stage).
- The live, real-system-touching spec is excluded from a bare `npx playwright test`
  run, since it creates real vendors, files real GitHub tickets, sends real emails,
  and spends metered Gemini quota.

## Non-goals

- No behavior changes to any automation logic (SRS scoring stays UI-based, scoring
  thresholds, classification prompts, ticket/email formatting all stay as-is).
- No change to the live external systems this project talks to (FairTPRM instance,
  GitHub repo, Gmail, Gemini).

## Toolchain

- Add devDependencies: `@playwright/test`, `typescript`, `@types/node`.
- New `tsconfig.json`: `target/module: ES2022`/`NodeNext`, `strict: true`,
  `esModuleInterop: true`. Playwright Test transpiles `.ts` on the fly — no separate
  build step is introduced.
- New `playwright.config.ts`:
  - `testDir: 'tests'`
  - `use.headless`: driven by `ONBOARDING_HEADLESS` env var (default `false`, matching
    current behavior)
  - `use.viewport: null` and `use.launchOptions.args: ['--start-maximized']` when
    headed (matches current `browserLauncher.js` behavior — full-width maximized
    window)
  - `use.storageState`: `data/session.json` when it exists (matches current session
    reuse)
- `package.json`:
  - `"test": "playwright test"` (replaces `node --test tests/*.test.js`)
  - `dotenv` stays a dependency; `playwright.config.ts` loads it via `import 'dotenv/config'` at the top so env vars are available to `use` config values

## File layout

### `src/*.ts` (typed library modules, one-to-one conversion from current `.js`)

| Current | New | Notes |
|---|---|---|
| `classifier.js` | `classifier.ts` | includes `buildInitialRiskPrompt` already added |
| `fairAnalysisClassifier.js` | `fairAnalysisClassifier.ts` | |
| `onboardingClassifier.js` | `onboardingClassifier.ts` | |
| `pipeline.js` | `pipeline.ts` | includes `assessNewVendorRisk` already added |
| `stateStore.js` | `stateStore.ts` | |
| `githubClient.js` | `githubClient.ts` | includes `formatInitialRiskIssue` already added |
| `mailer.js` | `mailer.ts` | |
| `fairtprmApi.js` | `fairtprmApi.ts` | |
| `geminiClient.js` | `geminiClient.ts` | |
| `selfAnswerGenerator.js` | `selfAnswerGenerator.ts` | |
| `browserLauncher.js` | `browserLauncher.ts` | `launchBrowser()`/`saveSession()` kept as utilities for any standalone/manual use, but the full-automation spec uses Playwright's own `page` fixture instead of calling `launchBrowser()` |
| `onboardingAutomation.js` | `onboardingAutomation.ts` | |
| `assessmentAutomation.js` | `assessmentAutomation.ts` | |
| `fairAnalysisAutomation.js` | `fairAnalysisAutomation.ts` | |
| `srsScoring.js` | `srsScoring.ts` | UI-scraping logic unchanged |
| `runOnboarding.js` | `runOnboarding.ts` | keep exported `runOnboarding()`; **drop** the CLI `if (import.meta.url === ...)` runner block — invocation now goes exclusively through the Playwright spec |
| `runAssessment.js` | `runAssessment.ts` | same: keep exported function, drop CLI block |
| `runSrsScoring.js` | `runSrsScoring.ts` | same |
| `runFairAnalysis.js` | `runFairAnalysis.ts` | same |
| `main.js` | `main.ts` | keep exported `main()` (the score-drop ticket pipeline), drop CLI block |

New: `src/types.ts` — shared interfaces: `Vendor`, `Classification`, `Issue`,
`ScoreChange`, `VendorState`, `VendorContext`.

### `tests/*.spec.ts` (converted 1:1 from `tests/*.test.js`)

All 15 existing files rename `.test.js` → `.spec.ts`, swap `import { test } from
'node:test'` + `node:assert/strict` for `import { test, expect } from
'@playwright/test'`, and convert assertions accordingly (`assert.equal(a, b)` →
`expect(a).toBe(b)`, `assert.match` → `expect(x).toMatch(...)`, `assert.throws` →
`expect(() => ...).toThrow(...)`, `assert.deepEqual` → `expect(x).toEqual(...)`).
No behavior or coverage changes — same test names, same fakes, same assertions,
just translated syntax.

### `tests/fullAutomation.spec.ts` (new — replaces `_fullAutomation.mjs`)

```ts
test('@live full vendor onboarding through ticket pipeline', async ({ page }) => {
  const vendor_name = `Acme QA Tools ${Date.now()}`;
  const vendor_domain = 'app.clokio.io';

  const onboarding = await test.step('Onboarding', () => runOnboarding(page, { vendor_name, vendor_domain }));
  await test.step('Assessment', () => runAssessment(page, { vendorSearchText: vendor_name }));
  const scoring = await test.step('SRS Scoring', () => runSrsScoring(page, { vendorName: vendor_name, vendorId: onboarding.vendorId }));
  await test.step('FAIR Analysis', () => runFairAnalysis(page, { vendorId: onboarding.vendorId }));
  await test.step('Ticket Pipeline', () => main());
});
```

The `runOnboarding`/`runAssessment`/`runSrsScoring`/`runFairAnalysis` functions
change signature to accept an existing `page` (from the fixture) instead of calling
`launchBrowser()` internally — this is the one behavioral-surface change the
migration requires, and it's what lets all 5 stages share one browser/context
instead of opening and closing a new one per stage.

The test name is prefixed `@live` so it's excluded from a bare `npx playwright
test` (see Safety below).

## Safety: excluding the live spec by default

`playwright.config.ts` sets `grepInvert: /@live/` as the default project's filter
(or equivalently, a dedicated `grep`/`grepInvert` pair across two projects: `unit`
matches everything except `@live`, `live` matches only `@live`). Running:

- `npx playwright test` → unit specs only (fast, no live side effects, no Gemini
  spend)
- `npx playwright test --grep @live` → runs the real end-to-end chain

## Testing

- All 15 unit specs must pass after conversion with identical coverage (same
  assertions ported, none dropped).
- The live spec is validated manually (run once with `--grep @live`) as part of
  this migration's acceptance, same as today's manual full-automation runs.

## Migration order (for the implementation plan)

1. Toolchain: `package.json`, `tsconfig.json`, `playwright.config.ts`.
2. Convert pure-logic `src/*.ts` modules first (no Playwright `Page` dependency):
   `types.ts`, `stateStore.ts`, `classifier.ts`, `fairAnalysisClassifier.ts`,
   `onboardingClassifier.ts`, `githubClient.ts`, `mailer.ts`, `fairtprmApi.ts`,
   `geminiClient.ts`, `selfAnswerGenerator.ts`, `pipeline.ts`.
3. Convert their corresponding unit specs; confirm green.
4. Convert Playwright-DOM-touching `src/*.ts` modules: `browserLauncher.ts`,
   `onboardingAutomation.ts`, `assessmentAutomation.ts`, `fairAnalysisAutomation.ts`,
   `srsScoring.ts`.
5. Convert their corresponding unit specs (the pure-function ones, e.g.
   `findVendorId`, `applyIdentityOverrides`); confirm green.
6. Convert `runOnboarding.ts`, `runAssessment.ts`, `runSrsScoring.ts`,
   `runFairAnalysis.ts`, `main.ts` — change signatures to accept `page` where
   needed, drop CLI runner blocks.
7. Write `tests/fullAutomation.spec.ts`, wire `@live` exclusion in
   `playwright.config.ts`.
8. Delete `_fullAutomation.mjs` and the old `tests/*.test.js` files.
9. Run `npx playwright test` (unit only) and `npx playwright test --grep @live`
   (manual, one real run) to confirm parity with pre-migration behavior.
