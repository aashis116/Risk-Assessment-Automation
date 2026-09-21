import type { Page } from '@playwright/test';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function humanPause(): Promise<void> {
  return delay(100 + Math.random() * 200);
}

export async function startFairAnalysis(page: Page, { baseURL, vendorId }: { baseURL: string; vendorId: number }): Promise<void> {
  await page.goto(`${baseURL}/fair-analysis.php?from_onboarding=${vendorId}`);
}

export async function fillFairAnalysisForm(page: Page, answers: Record<string, string>): Promise<void> {
  for (const [name, value] of Object.entries(answers)) {
    if (value === undefined || value === null || value === '') continue;
    await page.locator(`[name="${name}"]`).fill(String(value));
    await humanPause();
  }
}

export async function submitFairAnalysis(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Submit Analysis' }).click();
  await page.waitForLoadState('networkidle');
}
