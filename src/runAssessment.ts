import type { Page } from '@playwright/test';
import { login, fillSectionUntilStable, goToNextSection } from './onboardingAutomation.js';
import { createAssessment, uploadCertificate } from './assessmentAutomation.js';
import { generateAnswer } from './selfAnswerGenerator.js';
import type { Question } from './types.js';

function answerQuestions(questions: Question[]): Record<string, string | number> {
  const answers: Record<string, string | number> = {};
  for (const q of questions) answers[q.id] = generateAnswer(q);
  return answers;
}

export async function runAssessment(page: Page, {
  vendorSearchText,
  templateName = 'Tier 2 Vendor Assessment',
  certificate,
}: {
  vendorSearchText: string;
  templateName?: string;
  certificate?: {
    certificatePath: string;
    expiryDate?: string;
    submitterName: string;
    submitterTitle: string;
    submitterEmail: string;
    countryName: string;
    phoneNumber: string;
  };
}): Promise<{ tokenUrl: string; status: string }> {
  await login(page, {
    baseURL: process.env.FAIRTPRM_BASE_URL!,
    username: process.env.FAIRTPRM_USERNAME!,
    password: process.env.FAIRTPRM_PASSWORD!,
  });

  const tokenUrl = await createAssessment(page, {
    baseURL: process.env.FAIRTPRM_BASE_URL!,
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
}
