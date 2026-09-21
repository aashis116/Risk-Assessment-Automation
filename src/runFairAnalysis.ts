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
