import type { Page } from '@playwright/test';
import { login } from './onboardingAutomation.js';
import { triggerVendorScore, openScorePage, waitForScoreOnPage, assertScoringQueued } from './srsScoring.js';
import type { Vendor } from './types.js';

export async function runSrsScoring(page: Page, { vendorName, vendorId, provider = 'all' }: { vendorName: string; vendorId: number; provider?: string }): Promise<Vendor> {
  await login(page, {
    baseURL: process.env.FAIRTPRM_BASE_URL!,
    username: process.env.FAIRTPRM_USERNAME!,
    password: process.env.FAIRTPRM_PASSWORD!,
  });

  console.log('Opening the vendor score page...');
  await openScorePage(page, { baseURL: process.env.FAIRTPRM_BASE_URL!, vendorName });

  console.log(`Triggering ${provider} score for '${vendorName}'...`);
  await triggerVendorScore(page, { provider });

  await assertScoringQueued(page);

  console.log('Waiting for the score to update on the page...');
  const scores = await waitForScoreOnPage(page, { provider });

  console.log(`Scored: SRS=${scores.current_srs_score}, Shodan=${scores.current_shodan_score}`);
  return { id: vendorId, vendor_name: vendorName, vendor_domain: '', ...scores };
}
