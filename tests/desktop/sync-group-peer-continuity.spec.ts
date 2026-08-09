import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

test('a grouped desktop keeps device discovery available after its own group creation', async ({
  desktopWindow
}) => {
  await expectWorkspaceShell(desktopWindow);
  const overview = await desktopWindow.evaluate(async () =>
    globalThis.window?.electronAPI?.invoke('create_sync_group', {}));
  expect(overview?.sync_group).toMatchObject({
    local_member_state: 'active',
    members: [expect.objectContaining({ state: 'active' })]
  });

  const settingsDialog = await openSettingsCategory(desktopWindow, 'Sync');
  await expect(settingsDialog.getByText(overview.sync_group.display_name, { exact: true }).first()).toBeVisible();
  await expect(settingsDialog.getByRole('listitem')).toHaveCount(1);
  await expect(settingsDialog.getByRole('button', { name: /^(Find Devices|查找设备)$/ })).toBeEnabled();

  await settingsDialog.getByRole('button', { name: /^(Find Devices|查找设备)$/ }).click();
  await expect(settingsDialog.getByText(/^(Devices|设备)$/)).toBeVisible();
});
