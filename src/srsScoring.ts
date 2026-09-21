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
  { provider = 'all', timeoutMs = 300000, intervalMs = 10000 }: { provider?: string; timeoutMs?: number; intervalMs?: number } = {}
): Promise<{ current_srs_score: number | null; srs_grade: string | null; current_shodan_score: number | null; shodan_grade: string | null }> {
  const watchUpguard = provider === 'all' || provider === 'upguard';
  const watchShodan = provider === 'all' || provider === 'shodan';

  const baseline = await readScoreCards(page);
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const cards = await readScoreCards(page);
    const upguardDone = !watchUpguard || Boolean(cards.upguard?.date && cards.upguard.date !== baseline.upguard?.date);
    const shodanDone = !watchShodan || Boolean(cards.shodan?.date && cards.shodan.date !== baseline.shodan?.date);

    if (upguardDone && shodanDone) {
      return {
        current_srs_score: parsePercent(cards.upguard?.value),
        srs_grade: cards.upguard?.grade ?? null,
        current_shodan_score: parsePercent(cards.shodan?.value),
        shodan_grade: cards.shodan?.grade ?? null,
      };
    }

    await delay(intervalMs);
    await page.reload();
    await page.waitForLoadState('networkidle');
  }

  throw new Error('Timed out waiting for score to update on the vendor score page');
}
