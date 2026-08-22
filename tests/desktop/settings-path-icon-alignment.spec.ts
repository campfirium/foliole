import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { Locator, TestInfo } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsDialog } from './harness/settings';

const ARTIFACT_DIR = path.join(
  process.cwd(),
  '.tmp/artifacts/desktop-acceptance/t140'
);

async function capturePathButtons(buttons: Locator, prefix: string, testInfo: TestInfo) {
  const count = await buttons.count();
  expect(count).toBeGreaterThan(0);

  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    await expect(button).toBeVisible();
    const screenshotPath = path.join(ARTIFACT_DIR, `${prefix}-${index + 1}.png`);
    await button.screenshot({ path: screenshotPath });
    await testInfo.attach(`${prefix}-${index + 1}`, {
      contentType: 'image/png',
      path: screenshotPath
    });
  }
}

test('captures shared settings path buttons with trailing folder icons', async ({
  desktopWindow
}, testInfo) => {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await expectWorkspaceShell(desktopWindow);
  const dialog = await openSettingsDialog(desktopWindow);

  await dialog.getByRole('button', { name: /^(Storage|存储)$/ }).click();
  await expect(dialog.getByRole('heading', { name: /^(Storage locations|存储位置)$/ })).toBeVisible();
  await capturePathButtons(
    dialog.getByRole('button', { name: /^(Change location|更改位置)$/ }),
    'storage-path',
    testInfo
  );

  await dialog.getByRole('button', { name: /^(Backups|备份)$/ }).click();
  await expect(dialog.getByRole('heading', { level: 2, name: /^(Backups|备份)$/ })).toBeVisible();
  await capturePathButtons(
    dialog.getByRole('button', { name: /^(Change location|更改位置)$/ }),
    'backup-path',
    testInfo
  );
});
