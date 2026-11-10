import { defineConfig } from '@playwright/test';

import baseConfig from './playwright.config';

const baseURL = 'http://127.0.0.1:4184';

export default defineConfig({
  ...baseConfig,
  testMatch: ['companion-settings-sheets.spec.ts', 'companion-dive-reminder.spec.ts'],
  workers: 1,
  use: { ...baseConfig.use, baseURL },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4184 --strictPort',
    url: baseURL,
    reuseExistingServer: false
  }
});
