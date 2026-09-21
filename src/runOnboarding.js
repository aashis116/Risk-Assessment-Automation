import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { launchBrowser } from './browserLauncher.js';
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

function answerSection(questions, vendorContext) {
  const answers = {};
  for (const q of questions) {
    answers[q.id] = generateAnswer(q);
  }
  return applyIdentityOverrides(answers, questions, vendorContext);
}

export async function runOnboarding(vendorContext) {
  const { browser, page } = await launchBrowser();

  try {
    await login(page, {
      baseURL: process.env.FAIRTPRM_BASE_URL,
      username: process.env.FAIRTPRM_USERNAME,
      password: process.env.FAIRTPRM_PASSWORD,
    });

    const url = await startVendorOnboarding(page, { baseURL: process.env.FAIRTPRM_BASE_URL });
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
      baseURL: process.env.FAIRTPRM_BASE_URL,
      token: process.env.FAIRTPRM_API_TOKEN,
    });
    const vendors = await getVendors(apiCtx);
    const vendorId = findVendorId(vendors, vendorContext);
    await apiCtx.dispose();

    if (vendorId) {
      console.log(`Approving vendor id ${vendorId}...`);
      await approveVendor(page, { baseURL: process.env.FAIRTPRM_BASE_URL, requestId: vendorId });
      console.log('Vendor approved.');
    } else {
      console.log('Could not find the newly created vendor to approve.');
    }

    return { url, status, vendorId };
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runOnboarding({
    vendor_name: process.argv[2] || 'Acme QA Tools',
    vendor_domain: process.argv[3] || 'acmeqa.example.com',
  }).catch((err) => {
    console.error('Onboarding automation failed:', err);
    process.exitCode = 1;
  });
}
