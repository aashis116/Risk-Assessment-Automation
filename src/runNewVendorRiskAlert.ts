import { buildInitialRiskPrompt, parseClassificationResponse } from './classifier.js';
import { callGemini } from './geminiClient.js';
import { createIssue } from './githubClient.js';
import { sendAlertEmail } from './mailer.js';
import { assessNewVendorRisk } from './pipeline.js';
import type { Vendor, CreatedIssue } from './types.js';

async function classify(vendor: Vendor) {
  const prompt = buildInitialRiskPrompt(vendor);
  const raw = await callGemini({ apiKey: process.env.GEMINI_API_KEY!, prompt });
  return parseClassificationResponse(raw);
}

async function createTicket(issue: { title: string; body: string; labels: string[] }): Promise<CreatedIssue> {
  return createIssue({
    token: process.env.GITHUB_TOKEN!,
    repo: process.env.GITHUB_REPO!,
    ...issue,
  });
}

async function notify({ vendor, issue, classification }: { vendor: Vendor; issue: CreatedIssue; classification: Awaited<ReturnType<typeof classify>> }): Promise<void> {
  await sendAlertEmail({
    user: process.env.GMAIL_USER!,
    appPassword: process.env.GMAIL_APP_PASSWORD!,
    to: process.env.ALERT_EMAIL_TO!,
    vendor,
    issue,
    classification,
  });
}

export async function runNewVendorRiskAlert(vendor: Vendor): Promise<CreatedIssue> {
  return assessNewVendorRisk(vendor, { classify, createTicket, notify });
}
