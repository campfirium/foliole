import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from '@playwright/test';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

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
  outputDir: path.join(repoRoot, '.tmp/playwright-results/render-diagnostics'),
  reporter: [['list'], ['html', { open: 'never', outputFolder: path.join(repoRoot, '.tmp/playwright-report/render-diagnostics') }]],
  testDir: fileURLToPath(new URL('.', import.meta.url)),
  timeout: resolveTimeoutMs(),
  use: {
    trace: 'retain-on-failure'
  },
  workers: 1
});
