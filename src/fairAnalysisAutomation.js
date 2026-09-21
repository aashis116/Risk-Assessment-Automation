function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function humanPause() {
  return delay(100 + Math.random() * 200);
}

export async function startFairAnalysis(page, { baseURL, vendorId }) {
  await page.goto(`${baseURL}/fair-analysis.php?from_onboarding=${vendorId}`);
}

export async function fillFairAnalysisForm(page, answers) {
  for (const [name, value] of Object.entries(answers)) {
    if (value === undefined || value === null || value === '') continue;
    await page.locator(`[name="${name}"]`).fill(String(value));
    await humanPause();
  }
}

export async function submitFairAnalysis(page) {
  await page.getByRole('button', { name: 'Submit Analysis' }).click();
  await page.waitForLoadState('networkidle');
}
