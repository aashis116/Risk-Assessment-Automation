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
