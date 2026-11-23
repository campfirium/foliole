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
  await expect(dialog.getByRole('button', { name: /^(Start migration|开始迁移)$/ })).toHaveCount(0);
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

test('groups Aide, external access and migration in General settings', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  const dialog = await openSettingsDialog(desktopWindow);
  await dialog.getByRole('button', { name: /^(General|通用)$/ }).click();

  const sectionHeadings = dialog.getByRole('heading', { level: 3 });
  await expect(sectionHeadings).toHaveText([
    /^(Language|语言)$/,
    /^(System|系统)$/,
    /^(Interface|界面)$/,
    /^(Search|搜索)$/,
    /^(Global capture|全局剪辑)$/,
    /^Foliole Aide$/,
    /^(External access|外部访问)$/,
    /^(Data migration|数据迁移)$/
  ]);
  const aide = dialog.getByRole('region', { name: 'Foliole Aide' });
  await expect(aide.getByRole('heading', { name: /^(Aide settings|Aide 设置)$/ })).toBeVisible();
  await expect(aide.getByRole('button', { name: /^(Open|打开)$/ })).toBeEnabled();
  const external = dialog.getByRole('region', { name: /^(External access|外部访问)$/ });
  await expect(external.getByRole('heading', { name: 'Foliole CLI' })).toBeVisible();
  await expect(external.getByRole('switch', { name: /^(Allow learning progress imports|允许导入学习进度)$/ })).toBeVisible();
});
