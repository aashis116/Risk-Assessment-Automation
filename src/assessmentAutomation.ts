import type { Page } from '@playwright/test';

const TEMPLATE_IDS: Record<string, string> = {
  'AI Usage': '4',
  'ISO 27001:2022 Assessment': '1',
  'Tier 2 Vendor Assessment': '2',
};

export async function createAssessment(page: Page, { baseURL, templateName, vendorSearchText }: { baseURL: string; templateName: string; vendorSearchText: string }): Promise<string> {
  await page.goto(`${baseURL}/vendor-assessments.php`);
  await page.getByRole('button', { name: '+ New Assessment' }).click();

  const templateId = TEMPLATE_IDS[templateName];
  await page.evaluate((id) => {
    const el = document.querySelector('select[name="template_id"]') as HTMLSelectElement;
    el.value = id;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, templateId);

  await page.locator('#vendorSearch').pressSequentially(vendorSearchText, { delay: 60 });
  await page.locator('#vendorSuggestions div', { hasText: vendorSearchText }).first().click();

  await page.getByRole('button', { name: 'Create Assessment' }).click();
  await page.waitForLoadState('networkidle');

  const tokenUrl = await page.locator('code').textContent();
  return (tokenUrl ?? '').trim();
}

export async function uploadCertificate(page: Page, {
  assessmentUrl,
  certificatePath,
  expiryDate,
  submitterName,
  submitterTitle,
  submitterEmail,
  countryName,
  phoneNumber,
}: {
  assessmentUrl: string;
  certificatePath: string;
  expiryDate?: string;
  submitterName: string;
  submitterTitle: string;
  submitterEmail: string;
  countryName: string;
  phoneNumber: string;
}): Promise<void> {
  await page.goto(assessmentUrl);
  await page.getByRole('button', { name: 'Yes, Upload Certificate' }).click();

  const modal = page.locator('#modalCertificateForm');
  await page.setInputFiles('#modalCertificateFile', certificatePath);

  if (expiryDate) await modal.locator('#modalCertExpiry').fill(expiryDate);
  await modal.locator('input[name="submitter_name"]').fill(submitterName);
  await modal.locator('input[name="submitter_title"]').fill(submitterTitle);
  await modal.locator('input[name="submitter_email"]').fill(submitterEmail);

  await modal.getByRole('button', { name: 'Country dialling code' }).click();
  await modal.locator('.phone-cc.open .phone-cc-search').fill(countryName);
  await modal.getByRole('option', { name: new RegExp(countryName) }).click();
  await modal.locator('#modal_cert_phone_national').fill(phoneNumber);

  await modal.getByRole('checkbox', { name: /I certify/ }).check();

  page.once('dialog', (dialog) => dialog.accept());
  await modal.getByRole('button', { name: 'Upload Certificate' }).click();
  await page.waitForLoadState('networkidle');
}
