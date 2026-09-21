import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createApiContext, getVendors, getVendor } from './fairtprmApi.js';
import { loadState, saveState, getScores } from './stateStore.js';
import { buildClassificationPrompt, parseClassificationResponse } from './classifier.js';
import { callGemini } from './geminiClient.js';
import { createIssue } from './githubClient.js';
import { sendAlertEmail } from './mailer.js';
import { processVendor } from './pipeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = path.join(__dirname, '..', 'data', 'state.json');

async function classify(vendor, changes) {
  const prompt = buildClassificationPrompt(vendor, changes);
  const raw = await callGemini({ apiKey: process.env.GEMINI_API_KEY, prompt });
  return parseClassificationResponse(raw);
}

async function createTicket(issue) {
  return createIssue({
    token: process.env.GITHUB_TOKEN,
    repo: process.env.GITHUB_REPO,
    ...issue,
  });
}

async function notify({ vendor, issue, classification }) {
  return sendAlertEmail({
    user: process.env.GMAIL_USER,
    appPassword: process.env.GMAIL_APP_PASSWORD,
    to: process.env.ALERT_EMAIL_TO,
    vendor,
    issue,
    classification,
  });
}

export async function main() {
  const state = loadState(STATE_PATH);
  const apiCtx = await createApiContext({
    baseURL: process.env.FAIRTPRM_BASE_URL,
    token: process.env.FAIRTPRM_API_TOKEN,
  });

  const vendors = await getVendors(apiCtx);
  const results = [];

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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((created) => {
      console.log(`Pipeline run complete. ${created.length} ticket(s) created.`);
      created.forEach((c) => console.log(c.html_url));
    })
    .catch((err) => {
      console.error('Pipeline failed:', err);
      process.exitCode = 1;
    });
}
