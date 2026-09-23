import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, getSettingsDialog, openSettingsDialog } from './harness/settings';

const SCREENSHOT_PATH = path.resolve('.tmp/artifacts/desktop-acceptance/editor-context-menu-commands.png');
const SETTINGS_SCREENSHOT_PATH = path.resolve('.tmp/artifacts/desktop-acceptance/editor-context-menu-settings.png');

test('adds an editor command to the right-click menu and runs it', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await desktopWindow.evaluate(async () => {
    await window.__folioleWorkspaceDebug?.seedNodes?.([
      { content: 'Find this phrase in a topic', id: 'context-menu-command-topic', kind: 'topic', title: 'Context Menu Command Topic' }
    ]);
    await window.__folioleWorkspaceDebug?.openNode?.('context-menu-command-topic');
  });

  const settings = await openSettingsDialog(desktopWindow);
  await settings.getByRole('button', { name: 'Right-click menu' }).click();
  await settings.getByRole('button', { name: 'Restore default right-click actions' }).click();
  await settings.getByRole('button', { name: 'Add action' }).click();
  await desktopWindow.getByRole('button', { name: 'Find in Topic' }).click();
  await settings.getByText('Find in Topic').scrollIntoViewIfNeeded();
  await mkdir(path.dirname(SETTINGS_SCREENSHOT_PATH), { recursive: true });
  await desktopWindow.screenshot({ path: SETTINGS_SCREENSHOT_PATH });
  await testInfo.attach('editor-context-menu-settings', { contentType: 'image/png', path: SETTINGS_SCREENSHOT_PATH });
  await desktopWindow.keyboard.press('Escape');
  await expect(getSettingsDialog(desktopWindow)).toBeHidden();

  const editor = desktopWindow.locator('.prompt-editor-host .cm-content');
  await expect(editor).toBeVisible();
  await editor.click({ button: 'right' });
  const menuItem = desktopWindow.getByRole('menuitem', { name: 'Find in Topic' });
  await expect(menuItem).toBeVisible();
  await mkdir(path.dirname(SCREENSHOT_PATH), { recursive: true });
  await desktopWindow.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('editor-context-menu-commands', { contentType: 'image/png', path: SCREENSHOT_PATH });
  await menuItem.click();
  await expect(desktopWindow.getByTestId('topic-search-toolbar')).toBeVisible();
});
