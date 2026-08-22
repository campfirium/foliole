import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const COMMAND_DIALOG_NAME = 'Command palette';

async function openCommandPalette(desktopWindow: import('@playwright/test').Page) {
  const ribbon = desktopWindow.getByRole('region', { name: 'Left toolbar' });
  await ribbon.getByRole('button', { name: 'Command Palette' }).click();
  return desktopWindow.getByRole('dialog', { name: COMMAND_DIALOG_NAME });
}

test('opens custom copy from General and the command palette, then applies an inline replacement', async ({ desktopWindow }, testInfo) => {
  await desktopWindow.evaluate(() => {
    window.localStorage.setItem('foliole-app-language', 'en');
    window.localStorage.removeItem('foliole-custom-copy-overrides-v1');
  });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);

  const settingsDialog = await openSettingsCategory(desktopWindow, 'General');
  const customCopyButton = settingsDialog.getByRole('button', { name: 'Manage...' });
  const actionHelpSwitch = settingsDialog.getByRole('switch', { name: 'Action help on hover' });
  await expect(customCopyButton).toBeVisible();
  await expect(actionHelpSwitch).toBeVisible();
  const interfaceRowIds = await settingsDialog.locator('[data-settings-search-row-id]').evaluateAll((rows) =>
    rows.map((row) => row.getAttribute('data-settings-search-row-id'))
  );
  expect(interfaceRowIds.indexOf('general-custom-copy')).toBeLessThan(interfaceRowIds.indexOf('general-action-help'));
  await customCopyButton.click();
  await expect(desktopWindow.getByRole('dialog', { name: 'Custom copy' })).toBeVisible();
  await desktopWindow.keyboard.press('Escape');
  await expect(desktopWindow.getByRole('dialog', { name: 'Custom copy' })).toBeHidden();
  await expect(settingsDialog).toBeVisible();
  await desktopWindow.keyboard.press('Escape');

  const commandDialog = await openCommandPalette(desktopWindow);
  await commandDialog.getByRole('textbox', { name: 'Search commands' }).fill('Open Custom Copy');
  await commandDialog.getByRole('button', { name: 'Open Custom Copy', exact: true }).click();

  const customCopyDialog = desktopWindow.getByRole('dialog', { name: 'Custom copy' });
  await expect(customCopyDialog).toBeVisible();
  await customCopyDialog.getByRole('searchbox', { name: 'Search copy to change' }).fill('desktop.command.openSettings');
  const row = customCopyDialog.locator('[data-custom-copy-key="desktop.command.openSettings"]');
  await expect(row).toContainText('Open Settings');
  await row.getByRole('button', { name: 'Customize desktop.command.openSettings' }).dblclick();
  const editor = row.getByRole('textbox', { name: 'Customize desktop.command.openSettings' });
  await editor.fill('Preferences');
  await editor.press('Tab');

  const screenshotPath = path.join(process.cwd(), '.tmp/artifacts/desktop-acceptance/custom-copy.png');
  await customCopyDialog.screenshot({ path: screenshotPath });
  await testInfo.attach('custom-copy', { path: screenshotPath });
  await desktopWindow.keyboard.press('Escape');

  const updatedCommandDialog = await openCommandPalette(desktopWindow);
  await updatedCommandDialog.getByRole('textbox', { name: 'Search commands' }).fill('Preferences');
  await expect(updatedCommandDialog.getByRole('button', { name: 'Preferences', exact: true })).toBeVisible();
});
