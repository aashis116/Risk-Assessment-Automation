import { test } from '@playwright/test';
import { runOnboarding } from '../src/runOnboarding.js';
import { runAssessment } from '../src/runAssessment.js';
import { runSrsScoring } from '../src/runSrsScoring.js';
import { runFairAnalysis } from '../src/runFairAnalysis.js';
import { main as runTicketPipeline } from '../src/main.js';

test('full vendor onboarding through ticket pipeline', async ({ page }) => {
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
