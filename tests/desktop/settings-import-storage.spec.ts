import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsDialog } from './harness/settings';

const SCREENSHOT_PATH = path.join(process.cwd(), '.tmp/artifacts/settings-import-storage-hidden.png');

test('shows Import before storage locations in Storage settings', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const dialog = await openSettingsDialog(desktopWindow);
  await dialog.getByRole('button', { name: /^(Storage|存储)$/ }).click();

  const importHeading = dialog.getByRole('heading', { name: /^(Import|导入)$/ });
  const storageHeading = dialog.getByRole('heading', { name: /^(Storage locations|存储位置)$/ });
  await expect(importHeading).toBeVisible();
  await expect(storageHeading).toBeVisible();
  await expect(dialog.getByRole('heading', { name: /^(Inbox folder|收件箱文件夹)$/ })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: /^(Import folder|导入文件夹)$/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^(Open Import folder|打开导入文件夹)$/ })).toBeVisible();

  const importBox = await importHeading.boundingBox();
  const storageBox = await storageHeading.boundingBox();
  expect(importBox?.y ?? 0).toBeLessThan(storageBox?.y ?? 0);
  const screenshot = await dialog.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('settings-import-storage', {
    body: screenshot,
    contentType: 'image/png'
  });
});
