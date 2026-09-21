import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

const sessionPath = path.join(process.cwd(), 'data', 'session.json');

export default defineConfig({
  testDir: 'tests',
  timeout: 120000,
  fullyParallel: false,
  use: {
    headless: process.env.ONBOARDING_HEADLESS === 'true',
    viewport: process.env.ONBOARDING_HEADLESS === 'true' ? undefined : null,
    launchOptions: {
      args: process.env.ONBOARDING_HEADLESS === 'true' ? [] : ['--start-maximized'],
    },
    storageState: fs.existsSync(sessionPath) ? sessionPath : undefined,
    navigationTimeout: 90000,
    actionTimeout: 60000,
  },
});
