import { defineConfig } from '@playwright/test';

function resolveTimeoutMs() {
  const raw = process.env.FOLIOLE_ELECTRON_PLAYWRIGHT_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 120_000;
}

export default defineConfig({
  fullyParallel: false,
  outputDir: '.tmp/playwright-results/desktop',
  reporter: [['list'], ['html', { open: 'never', outputFolder: '.tmp/playwright-report/desktop' }]],
  testDir: './tests/desktop',
  timeout: resolveTimeoutMs(),
  use: {
    trace: 'retain-on-failure'
  },
  workers: 1
});
