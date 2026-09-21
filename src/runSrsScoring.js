import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { launchBrowser } from './browserLauncher.js';
import { login } from './onboardingAutomation.js';
import { triggerVendorScore, waitForScore } from './srsScoring.js';
import { createApiContext, getVendor } from './fairtprmApi.js';

export async function runSrsScoring({ vendorName, vendorId, provider = 'all' }) {
  const { browser, page } = await launchBrowser();

  try {
    await login(page, {
      baseURL: process.env.FAIRTPRM_BASE_URL,
      username: process.env.FAIRTPRM_USERNAME,
      password: process.env.FAIRTPRM_PASSWORD,
    });

    console.log(`Triggering ${provider} score for '${vendorName}'...`);
    await triggerVendorScore(page, { baseURL: process.env.FAIRTPRM_BASE_URL, vendorName, provider });

    const apiCtx = await createApiContext({
      baseURL: process.env.FAIRTPRM_BASE_URL,
      token: process.env.FAIRTPRM_API_TOKEN,
    });

    console.log('Waiting for background scoring to complete...');
    const vendor = await waitForScore(apiCtx, getVendor, vendorId);
    await apiCtx.dispose();

    console.log(`Scored: SRS=${vendor.current_srs_score}, Shodan=${vendor.current_shodan_score}`);
    return vendor;
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const vendorId = Number(process.argv[3]);
  runSrsScoring({ vendorName: process.argv[2], vendorId }).catch((err) => {
    console.error('SRS scoring automation failed:', err);
    process.exitCode = 1;
  });
}
