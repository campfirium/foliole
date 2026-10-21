import { defineConfig } from '@playwright/test';

// The test limit only stops hangs; calibrated times warn through the calibration reporter.
const PLAYWRIGHT_HANG_CAP_MS = 600_000;
function resolveTimeoutMs() {
  const raw = process.env.FOLIOLE_ELECTRON_PLAYWRIGHT_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return PLAYWRIGHT_HANG_CAP_MS;
}

export default defineConfig({
  fullyParallel: false,
  outputDir: '.tmp/playwright-results/desktop',
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: '.tmp/playwright-report/desktop' }],
    ['./scripts/desktop/playwright-calibration-reporter.mjs']
  ],
  retries: process.env.CI ? 1 : 0,
  testDir: './tests/desktop',
  timeout: resolveTimeoutMs(),
  use: {
    trace: 'retain-on-failure'
  },
  workers: 1
});
