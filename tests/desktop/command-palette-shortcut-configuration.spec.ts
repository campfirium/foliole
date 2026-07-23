import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, getSettingsDialog } from './harness/settings';

test('shows native shortcut symbols and opens the matching Hotkeys row', async ({ desktopWindow }, testInfo) => {
  await desktopWindow.evaluate(() => {
    window.localStorage.setItem('foliole-app-language', 'en');
  });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);

  const ribbon = desktopWindow.getByRole('region', { name: 'Left toolbar' });
  await ribbon.getByRole('button', { name: 'Command Palette' }).click();
  const commandDialog = desktopWindow.getByRole('dialog', { name: 'Command palette' });
  await expect(commandDialog).toBeVisible();

  const configureShortcut = commandDialog.getByRole('button', {
    name: 'Configure shortcut for Create Folder'
  });
  await expect(configureShortcut).toHaveText('⇧ ⌘ N');
  await configureShortcut.click();

  await expect(commandDialog).toBeHidden();
  const settingsDialog = getSettingsDialog(desktopWindow);
  await expect(settingsDialog).toBeVisible();
  await expect(settingsDialog.getByRole('button', { name: 'Hotkeys', exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  );
  await expect(settingsDialog.getByRole('searchbox', { name: 'Search hotkeys' })).toHaveValue('Create Folder');
  const shortcut = settingsDialog.getByRole('button', { name: 'Shortcut for Create Folder', exact: true });
  await expect(shortcut).toHaveText('⇧ ⌘ N');
  await expect(shortcut).toBeFocused();

  const screenshotPath = path.join(process.cwd(), '.tmp/artifacts/command-palette-shortcut-configuration.png');
  await settingsDialog.screenshot({ path: screenshotPath });
  await testInfo.attach('command-palette-shortcut-configuration', { path: screenshotPath });
});
