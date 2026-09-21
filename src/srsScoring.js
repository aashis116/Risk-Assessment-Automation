function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function triggerVendorScore(page, { baseURL, vendorName, provider = 'all' }) {
  await page.goto(`${baseURL}/vendor-srs-list.php`);

  page.once('dialog', (dialog) => dialog.accept());

  await page.evaluate(
    ({ vendorName, provider }) => {
      const rows = Array.from(document.querySelectorAll('tr'));
      const row = rows.find((r) => r.textContent.includes(vendorName));
      if (!row) throw new Error(`Vendor row not found for: ${vendorName}`);
      const btn = row.querySelector(`button[name="rescore_provider"][value="${provider}"]`);
      if (!btn) throw new Error(`Score button not found for provider: ${provider}`);
      btn.click();
    },
    { vendorName, provider }
  );

  await page.waitForLoadState('networkidle');
}

export async function waitForScore(apiCtx, getVendor, vendorId, { timeoutMs = 300000, intervalMs = 10000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const vendor = await getVendor(apiCtx, vendorId);
    if (vendor.current_srs_score !== null && vendor.current_shodan_score !== null) return vendor;
    await delay(intervalMs);
  }
  throw new Error(`Timed out waiting for score on vendor ${vendorId}`);
}
