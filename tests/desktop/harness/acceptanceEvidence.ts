import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { Page, TestInfo } from '@playwright/test';

function safeSegment(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 80) || 'desktop';
}

export async function attachDesktopAcceptanceEvidence(page: Page, testInfo: TestInfo) {
  if (process.env.FOLIOLE_DESKTOP_ACCEPTANCE_EVIDENCE !== '1') return;
  if (testInfo.status !== 'passed' || testInfo.status !== testInfo.expectedStatus) return;
  if (page.isClosed()) return;
  const mode = process.env.FOLIOLE_ELECTRON_NATIVE_HIDDEN === '1' ? 'hidden' : 'visible';
  const root = path.resolve(
    process.env.FOLIOLE_DESKTOP_ACCEPTANCE_DIR?.trim() || path.join('.tmp', 'artifacts', 'desktop-acceptance')
  );
  const filename = `${mode}-${safeSegment(testInfo.title)}-${testInfo.workerIndex}.png`;
  const screenshotPath = path.join(root, filename);
  await mkdir(root, { recursive: true });
  await page.screenshot({ path: screenshotPath });
  await testInfo.attach(`desktop-${mode}-acceptance`, {
    contentType: 'image/png',
    path: screenshotPath
  });
}
