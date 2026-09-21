import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';

const SESSION_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'session.json');

export async function launchBrowser(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  const headless = process.env.ONBOARDING_HEADLESS === 'true';
  const browser = await chromium.launch({
    headless,
    args: headless ? [] : ['--start-maximized'],
  });

  const context = await browser.newContext({
    viewport: headless ? undefined : null,
    storageState: fs.existsSync(SESSION_PATH) ? SESSION_PATH : undefined,
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(90000);
  page.setDefaultTimeout(60000);
  return { browser, context, page };
}

export async function saveSession(context: BrowserContext): Promise<void> {
  await context.storageState({ path: SESSION_PATH });
}
