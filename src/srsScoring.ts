import type { Page } from '@playwright/test';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RESCORE_FIELD_BY_PROVIDER: Record<string, string> = {
  all: 'rescore',
  upguard: 'rescore_upguard',
  shodan: 'rescore_shodan',
};

export async function triggerVendorScore(page: Page, { provider = 'all' }: { provider?: string } = {}): Promise<void> {
  const fieldName = RESCORE_FIELD_BY_PROVIDER[provider];
  if (!fieldName) throw new Error(`Unknown provider: ${provider}`);

  await page.locator('button[data-toggle="scoreMenu"]').click();
  await page.locator(`button[name="${fieldName}"]`).click();
  await page.waitForLoadState('networkidle');
}

export async function assertScoringQueued(page: Page): Promise<void> {
  const queued = await page
    .getByText('Scoring queued', { exact: false })
    .isVisible()
    .catch(() => false);
  if (!queued) {
    throw new Error('Score trigger did not queue a scan (no "Scoring queued" banner found) — the rescore click likely failed');
  }
}

export async function openScorePage(page: Page, { baseURL, vendorName }: { baseURL: string; vendorName: string }): Promise<void> {
  await page.goto(`${baseURL}/vendor-srs-list.php`);
  await page.waitForLoadState('networkidle');

  const href = await page.evaluate((vendorName) => {
    const rows = Array.from(document.querySelectorAll('tr'));
    const row = rows.find((r) => r.textContent?.includes(vendorName));
    if (!row) throw new Error(`Vendor row not found for: ${vendorName}`);
    const link = Array.from(row.querySelectorAll('a')).find((a) => /view score/i.test(a.textContent || ''));
    if (!link) throw new Error('View Score link not found for vendor row');
    return link.getAttribute('href');
  }, vendorName);

  await page.goto(new URL(href!, baseURL).toString());
  await page.waitForLoadState('networkidle');
}

interface ScoreCard {
  value: string | null;
  grade: string | null;
  date: string | null;
}

function readScoreCards(page: Page): Promise<{ upguard: ScoreCard | null; shodan: ScoreCard | null }> {
  return page.evaluate(() => {
    function readCard(heading: string): ScoreCard | null {
      const h3 = Array.from(document.querySelectorAll('.card h3')).find((el) => el.textContent?.trim() === heading);
      if (!h3) return null;
      const card = h3.closest('.card') as HTMLElement;
      const value = card.querySelector('.score-value')?.textContent?.trim() ?? null;
      const grade = card.querySelector('.score-grade')?.textContent?.trim() ?? null;
      const date = card.querySelector('.score-date')?.textContent?.trim() ?? null;
      return { value, grade, date };
    }
    return {
      upguard: readCard('UpGuard Score'),
      shodan: readCard('SRS Scanner Score'),
    };
  });
}

function parsePercent(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = Number(value.replace('%', '').trim());
  return Number.isNaN(n) ? null : n;
}

export async function waitForScoreOnPage(
  page: Page,
  { timeoutMs = 720000, pollIntervalMs = 3000 }: { timeoutMs?: number; pollIntervalMs?: number } = {}
): Promise<{ current_srs_score: number | null; srs_grade: string | null; current_shodan_score: number | null; shodan_grade: string | null; resultBanner: string }> {
  // The site's own page JS polls api-rescore-status.php every 3s and navigates itself
  // (window.location.href) once the background job finishes, landing on a page that shows
  // a one-time flash result banner, e.g. "UpGuard: 908 (A) | Shodan: 82 (B)" (.alert-success),
  // or "UpGuard: 506 (F) | ERRORS: Shodan: Could not resolve domain: ..." (.alert-danger) when
  // one provider errors (invalid/unresolvable domain) but another still produced a real score.
  // We treat "at least one provider produced a score" as success regardless of banner color —
  // the color reflects whether ANY provider errored, not whether the run was useless to us.
  const start = Date.now();
  const resultBanner = page.locator('.alert-success, .alert-warning, .alert-danger');

  while (Date.now() - start < timeoutMs) {
    if (await resultBanner.isVisible().catch(() => false)) {
      const text = (await resultBanner.innerText()).trim();

      // The banner renders as soon as the post-scoring page starts loading; give the rest
      // of the page (score cards further down) a moment to finish rendering before reading them.
      await page.waitForLoadState('networkidle');

      const cards = await readScoreCards(page);
      if (!cards.upguard && !cards.shodan) {
        throw new Error(`Scoring failed for every provider: "${text}"`);
      }
      return {
        current_srs_score: parsePercent(cards.upguard?.value),
        srs_grade: cards.upguard?.grade ?? null,
        current_shodan_score: parsePercent(cards.shodan?.value),
        shodan_grade: cards.shodan?.grade ?? null,
        resultBanner: text,
      };
    }

    await delay(pollIntervalMs);
  }

  throw new Error('Timed out waiting for the score result banner on the vendor score page');
}
