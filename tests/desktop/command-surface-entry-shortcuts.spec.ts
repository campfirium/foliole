import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, getSettingsDialog, openSettingsCategory } from './harness/settings';

const COMMAND_DIALOG_NAME = 'Command palette';
const SEARCH_DIALOG_NAME = 'Workspace search';

async function expectCommandSurfacesHidden(page: Page) {
  await expect(page.getByRole('dialog', { name: COMMAND_DIALOG_NAME })).toBeHidden();
  await expect(page.getByRole('dialog', { name: SEARCH_DIALOG_NAME })).toBeHidden();
}

async function openWorkspaceSearchWithDefaultShortcut(page: Page) {
  const searchDialog = page.getByRole('dialog', { name: SEARCH_DIALOG_NAME });
  const enhancementPrompt = page.getByRole('dialog', {
    name: /Use Chinese, Japanese, or Korean search\?|Turn on search enhancement for languages without spaces/
  });
  await page.keyboard.press('Meta+Shift+F');
  await expect.poll(async () => {
    if (await enhancementPrompt.isVisible()) return 'prompt';
    if (await searchDialog.isVisible()) return 'search';
    return 'pending';
  }).not.toBe('pending');
  if (await enhancementPrompt.isVisible().catch(() => false)) {
    await enhancementPrompt.getByRole('button', { name: 'Not now' }).click();
    await expect(enhancementPrompt).toBeHidden();
  }
  await expect(searchDialog).toBeVisible();
}

async function recordCommandPaletteShortcut(electronApp: ElectronApplication) {
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows().find((window) => !window.isDestroyed())?.webContents.send(
      'foliole:native-keyboard-input',
      {
        altKey: true,
        code: 'KeyP',
        controlKey: false,
        key: 'p',
        metaKey: true,
        shiftKey: false,
        type: 'keyDown'
      }
    );
  });
}

test('keeps command surface entry shortcuts aligned with macOS settings', async ({
  desktopSession,
  desktopWindow
}, testInfo) => {
  test.skip(process.platform !== 'darwin', 'macOS is the declared acceptance host');
  await desktopWindow.evaluate(() => {
    window.localStorage.setItem('foliole-app-language', 'en');
    window.localStorage.removeItem('foliole-command-shortcut-overrides');
  });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);

  const commandDialog = desktopWindow.getByRole('dialog', { name: COMMAND_DIALOG_NAME });
  const searchDialog = desktopWindow.getByRole('dialog', { name: SEARCH_DIALOG_NAME });
  await expectCommandSurfacesHidden(desktopWindow);

  await desktopWindow.keyboard.press('Meta+P');
  await desktopWindow.keyboard.press('Meta+K');
  await expectCommandSurfacesHidden(desktopWindow);

  await desktopWindow.keyboard.press('Meta+Shift+P');
  await expect(commandDialog).toBeVisible();
  const commandScreenshot = path.join(process.cwd(), '.tmp/artifacts/desktop-acceptance/command-palette-default-shortcut.png');
  await commandDialog.screenshot({ path: commandScreenshot });
  await testInfo.attach('command-palette-default-shortcut', { path: commandScreenshot });
  await desktopWindow.keyboard.press('Meta+Shift+P');
  await expect(commandDialog).toBeHidden();

  await openWorkspaceSearchWithDefaultShortcut(desktopWindow);
  const searchScreenshot = path.join(process.cwd(), '.tmp/artifacts/desktop-acceptance/workspace-search-default-shortcut.png');
  await searchDialog.screenshot({ path: searchScreenshot });
  await testInfo.attach('workspace-search-default-shortcut', { path: searchScreenshot });
  await desktopWindow.keyboard.press('Meta+Shift+F');
  await expect(searchDialog).toBeHidden();

  const settingsDialog = await openSettingsCategory(desktopWindow, 'Hotkeys');
  await desktopWindow.keyboard.press('Meta+Shift+P');
  await desktopWindow.keyboard.press('Meta+Shift+F');
  await expect(settingsDialog).toBeVisible();
  await expectCommandSurfacesHidden(desktopWindow);

  await settingsDialog.getByRole('searchbox', { name: 'Search hotkeys' }).fill('Command Palette');
  const commandShortcut = settingsDialog.getByRole('button', {
    name: 'Shortcut for Command Palette',
    exact: true
  });
  await expect(commandShortcut).toHaveText('⇧ ⌘ P');
  await commandShortcut.click();
  await recordCommandPaletteShortcut(desktopSession.electronApp);
  await expect(commandShortcut).toContainText('⌥');
  await expect(commandShortcut).toContainText('⌘');
  await desktopWindow.keyboard.press('Meta+Alt+P');
  await expect(getSettingsDialog(desktopWindow)).toBeVisible();
  await expect(commandDialog).toBeHidden();

  await desktopWindow.keyboard.press('Escape');
  await expect(settingsDialog).toBeHidden();
  await desktopWindow.keyboard.press('Meta+Shift+P');
  await expect(commandDialog).toBeHidden();
  await desktopWindow.keyboard.press('Meta+Alt+P');
  await expect(commandDialog).toBeVisible();
});
