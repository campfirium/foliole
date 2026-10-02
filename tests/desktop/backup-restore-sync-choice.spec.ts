import path from 'node:path';

import type { Page, TestInfo } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { openBackupsSection, openSettingsCategory } from './harness/settings';

async function backup(page: Page) {
  return await page.evaluate(() => window.electronAPI.invoke('backup_sqlite_database', {})) as { destinationPath: string };
}
async function restore(page: Page, file: string) {
  const settings = await openBackupsSection(page);
  await settings.locator('[data-settings-row]').filter({ has: page.getByRole('heading', { name: path.basename(file) }) })
    .getByRole('button', { name: /^(Restore|恢复)$/ }).click();
}
async function finish(page: Page) {
  const dialog = page.getByRole('dialog', { name: /^(Backup restored|备份已恢复)$/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /^(Done|完成)$/ }).click();
}
async function overview(page: Page) {
  return await page.evaluate(() => window.electronAPI.invoke('load_sync_group_overview', {})) as {
    sync_paused: boolean; pending_backup_restore: string | null; sync_group: { group_id: string } | null
  };
}
async function evidence(page: Page, info: TestInfo, name: string) {
  const screenshot = await page.screenshot({ path: path.join(process.cwd(), '.tmp/artifacts/t296', `${name}.png`) });
  await info.attach(name, { body: screenshot, contentType: 'image/png' });
}

test('chooses a configuration source and restores locally when that source has no group', async ({ desktopWindow }, info) => {
  const saved = await backup(desktopWindow);
  await desktopWindow.evaluate(() => window.electronAPI.invoke('create_sync_group', {}));
  await restore(desktopWindow, saved.destinationPath);
  const dialog = desktopWindow.getByRole('dialog', { name: /^(Sync settings for this restore|本次恢复的同步设置)$/ });
  await expect(dialog).toBeVisible();
  await evidence(desktopWindow, info, 'native-source-choice');
  await dialog.getByRole('button', { name: /Use the backup’s sync group settings|使用备份的同步组设置/ }).click();
  await finish(desktopWindow);
  expect((await overview(desktopWindow)).sync_group).toBeNull();
});

test('keeps the current group paused until the user confirms whole-group replacement', async ({ desktopWindow }, info) => {
  const saved = await backup(desktopWindow);
  await desktopWindow.evaluate(() => window.electronAPI.invoke('create_sync_group', {}));
  const before = await overview(desktopWindow);
  await restore(desktopWindow, saved.destinationPath);
  await desktopWindow.getByRole('button', { name: /Keep current sync settings|保留当前同步设置/ }).click();
  const action = desktopWindow.getByRole('dialog', { name: /^(Sync after restoring|恢复后的同步)$/ });
  await expect(action).toBeVisible();
  await evidence(desktopWindow, info, 'native-action-choice');
  await action.getByRole('button', { name: /Pause sync and restore only this device first|暂停同步，先只恢复本机/ }).click();
  await finish(desktopWindow);
  const paused = await overview(desktopWindow);
  expect(paused.sync_group?.group_id).toBe(before.sync_group?.group_id);
  expect(paused.sync_paused).toBe(true);
  expect(paused.pending_backup_restore).toBeTruthy();
  const settings = await openSettingsCategory(desktopWindow, 'Sync');
  await expect(settings.getByText(/Sync paused after restore|恢复后同步已暂停/)).toBeVisible();
  await evidence(desktopWindow, info, 'native-pending-notice');
  await settings.getByRole('button', { name: /^(Resume Sync|恢复同步)$/ }).click();
  const confirm = desktopWindow.getByRole('dialog', { name: /^(Resume sync|恢复同步)$/ });
  await expect(confirm).toContainText(/overwrite the entire sync group|当前本机资料将覆盖整个同步组/);
  await evidence(desktopWindow, info, 'native-resume-confirmation');
  await confirm.getByRole('button', { name: /^(Cancel|取消)$/ }).click();
  expect((await overview(desktopWindow)).pending_backup_restore).toBe(paused.pending_backup_restore);
  await settings.getByRole('button', { name: /^(Resume Sync|恢复同步)$/ }).click();
  await confirm.getByRole('button', { name: /^(Resume Sync|恢复同步)$/ }).click();
  await expect.poll(async () => (await overview(desktopWindow)).pending_backup_restore).toBeNull();
  expect((await overview(desktopWindow)).sync_paused).toBe(false);
});

test('skips source selection for the same group when participation settings differ', async ({ desktopWindow }, info) => {
  await desktopWindow.evaluate(() => window.electronAPI.invoke('create_sync_group', {}));
  const before = await overview(desktopWindow);
  const saved = await backup(desktopWindow);
  await desktopWindow.evaluate(() => window.electronAPI.invoke('save_app_settings_state', {
    settings: { 'foliole-desktop-device-sync-paused': 'true' }
  }));
  await restore(desktopWindow, saved.destinationPath);
  const action = desktopWindow.getByRole('dialog', { name: /^(Sync after restoring|恢复后的同步)$/ });
  await expect(action).toBeVisible();
  await action.getByRole('button', { name: /Sync now and overwrite the entire group|立即同步并覆盖全组/ }).click();
  await finish(desktopWindow);
  const result = await overview(desktopWindow);
  expect(result.sync_group?.group_id).toBe(before.sync_group?.group_id);
  expect(result.sync_paused).toBe(false);
  expect(result.pending_backup_restore).toBeNull();
  await evidence(desktopWindow, info, 'native-immediate-restore');
});

test('restores ungrouped backups without a redundant source choice after sync settings change', async ({ desktopWindow }, info) => {
  const saved = await backup(desktopWindow);
  await desktopWindow.evaluate(() => window.electronAPI.invoke('save_app_settings_state', {
    settings: { 'foliole-desktop-device-sync-paused': 'true' }
  }));
  await restore(desktopWindow, saved.destinationPath);
  await expect(desktopWindow.getByRole('dialog', {
    name: /^(Sync settings for this restore|本次恢复的同步设置)$/
  })).toHaveCount(0);
  await finish(desktopWindow);
  expect((await overview(desktopWindow)).sync_group).toBeNull();
  await evidence(desktopWindow, info, 'native-ungrouped-no-choice');
});
