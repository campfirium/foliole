import path from 'node:path';
import process from 'node:process';

import { defineConfig } from '@playwright/test';

const resultRoot = process.env.FOLIOLE_VALIDATION_RESULT_DIR?.trim();
if (!resultRoot) throw new Error('FOLIOLE_VALIDATION_RESULT_DIR is required');

export default defineConfig({
  fullyParallel: false,
  outputDir: path.join(resultRoot, 'playwright-results'),
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: path.join(resultRoot, 'playwright-report') }]
  ],
  testDir: path.resolve('.'),
  timeout: 120_000,
  use: { trace: 'retain-on-failure' },
  workers: 1
});
