import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { launchBrowser } from './browserLauncher.js';
import { login, fillSectionUntilStable, goToNextSection } from './onboardingAutomation.js';
import { createAssessment, uploadCertificate } from './assessmentAutomation.js';
import { generateAnswer } from './selfAnswerGenerator.js';

function answerQuestions(questions) {
  const answers = {};
  for (const q of questions) answers[q.id] = generateAnswer(q);
  return answers;
}

export async function runAssessment({
  vendorSearchText,
  templateName = 'Tier 2 Vendor Assessment',
  certificate,
}) {
  const { browser, page } = await launchBrowser();

  try {
    await login(page, {
      baseURL: process.env.FAIRTPRM_BASE_URL,
      username: process.env.FAIRTPRM_USERNAME,
      password: process.env.FAIRTPRM_PASSWORD,
    });

    const tokenUrl = await createAssessment(page, {
      baseURL: process.env.FAIRTPRM_BASE_URL,
      templateName,
      vendorSearchText,
    });
    console.log(`Created assessment: ${tokenUrl}`);

    if (templateName === 'ISO 27001:2022 Assessment' && certificate) {
      await uploadCertificate(page, { assessmentUrl: tokenUrl, ...certificate });
      console.log('Certificate uploaded; assessment completed.');
      return { tokenUrl, status: 'completed-via-certificate' };
    }

    await page.goto(tokenUrl);

    let status = 'next';
    let sectionNumber = 0;
    while (status === 'next') {
      console.log(`Section ${sectionNumber}: ${page.url()}`);
      await fillSectionUntilStable(page, answerQuestions, (pass, newQuestions) =>
        console.log(`  pass ${pass + 1}: answering ${newQuestions.length} newly visible question(s)`)
      );
      status = await goToNextSection(page);
      console.log(`  -> after nav: ${page.url()} (status: ${status})`);
      sectionNumber += 1;
    }

    console.log(`Assessment finished with status: ${status}`);
    return { tokenUrl, status };
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAssessment({ vendorSearchText: process.argv[2] || 'Bright Ledger' }).catch((err) => {
    console.error('Assessment automation failed:', err);
    process.exitCode = 1;
  });
}
