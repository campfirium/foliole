import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

test('Sync settings presents the local group roster and real local actions', async ({
  desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const overview = await desktopWindow.evaluate(async () =>
    globalThis.window?.electronAPI?.invoke('create_sync_group', {}));
  expect(overview?.sync_group).toMatchObject({
    local_member_state: 'active',
    members: [expect.objectContaining({ state: 'active' })]
  });

  const settingsDialog = await openSettingsCategory(desktopWindow, 'Sync');
  await expect(settingsDialog.getByText(new RegExp(`^${overview.sync_group.display_name}(?:'s| 的) Sync Group$|^${overview.sync_group.display_name} 的同步组$`))).toBeVisible();
  await expect(settingsDialog.getByRole('listitem')).toHaveCount(1);
  await expect(settingsDialog.getByText('macOS', { exact: true })).toBeVisible();
  await expect(settingsDialog.getByRole('button', { name: /^(Pause Sync|暂停同步)$/ })).toBeEnabled();
  await expect(settingsDialog.getByRole('button', { name: /^(Leave Sync Group|离开同步组)$/ })).toBeEnabled();
  await expect(settingsDialog.getByText(/^(This device|本机)$/)).toHaveCount(0);

  await settingsDialog.getByRole('button', { name: /^(Pause Sync|暂停同步)$/ }).click();
  await expect(settingsDialog.getByRole('button', { name: /^(Resume Sync|恢复同步)$/ })).toBeEnabled();
  await expect(settingsDialog.getByRole('alert')).toHaveCount(0);
  const screenshotPath = path.join(process.cwd(), '.tmp/artifacts/desktop-acceptance/sync-settings-redesign.png');
  await settingsDialog.screenshot({ path: screenshotPath });
  await testInfo.attach('sync-settings-redesign', { path: screenshotPath });

  await settingsDialog.getByRole('button', { name: /^(Leave Sync Group|离开同步组)$/ }).click();
  await expect(desktopWindow.getByRole('dialog', { name: /^(Leave Sync Group\?|离开同步组？)$/ })).toBeVisible();
});
