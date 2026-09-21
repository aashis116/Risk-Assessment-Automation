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
