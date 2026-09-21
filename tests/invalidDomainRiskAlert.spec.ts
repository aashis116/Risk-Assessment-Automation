import { test } from '@playwright/test';
import { runOnboarding } from '../src/runOnboarding.js';
import { runSrsScoring } from '../src/runSrsScoring.js';
import { runNewVendorRiskAlert } from '../src/runNewVendorRiskAlert.js';
import { createApiContext, getVendor } from '../src/fairtprmApi.js';

test('invalid-domain vendor triggers a baseline risk alert (GitHub issue + email)', async ({ page }) => {
  test.setTimeout(10 * 60 * 1000);

  const stamp = Date.now();
  const vendor_name = `Invalid Domain Test ${stamp}`;
  const vendor_domain = `nonexistent-invalid-vendor-${stamp}.example.com`;

  const onboarding = await test.step('Onboarding', () => runOnboarding(page, { vendor_name, vendor_domain }));
  const vendorId: number = onboarding.vendorId ?? (() => {
    throw new Error('Onboarding did not yield a vendorId; aborting.');
  })();

  const srsResult = await test.step('SRS Scoring', () =>
    runSrsScoring(page, { vendorName: vendor_name, vendorId, provider: 'all' })
  );
  console.log(`SRS result: SRS=${srsResult.current_srs_score} (${srsResult.srs_grade}), Shodan=${srsResult.current_shodan_score}`);

  const apiCtx = await createApiContext({
    baseURL: process.env.FAIRTPRM_BASE_URL!,
    token: process.env.FAIRTPRM_API_TOKEN!,
  });
  const apiVendor = await getVendor(apiCtx, vendorId);
  await apiCtx.dispose();

  const vendor = {
    ...apiVendor,
    current_srs_score: srsResult.current_srs_score,
    current_shodan_score: srsResult.current_shodan_score,
  };

  const issue = await test.step('Risk Alert (GitHub + Email)', () => runNewVendorRiskAlert(vendor));
  console.log(`Created issue: ${issue.html_url}`);
});
