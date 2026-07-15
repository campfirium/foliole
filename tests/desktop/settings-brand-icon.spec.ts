import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { openSettingsDialog } from './harness/settings';

test('uses the standalone Foliole leaf inside settings', async ({ desktopWindow }, testInfo) => {
  const dialog = await openSettingsDialog(desktopWindow);
  const brandLeaf = dialog.locator('img[src*="foliole-leaf-tight"]');

  await expect(brandLeaf).toBeVisible();
  await expect(dialog.locator('img[src*="foliole-app-icon"]')).toHaveCount(0);

  const screenshot = await dialog.screenshot();
  const screenshotDir = path.join(process.cwd(), '.tmp', 'artifacts', 'desktop-acceptance');
  const screenshotPath = path.join(screenshotDir, 'settings-brand-leaf-hidden-native.png');
  await mkdir(screenshotDir, { recursive: true });
  await writeFile(screenshotPath, screenshot);
  await testInfo.attach('settings-brand-leaf', {
    body: screenshot,
    contentType: 'image/png'
  });
});
