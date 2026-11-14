import { execFile } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import type { ElectronApplication, Page } from '@playwright/test';

import { focusEditor, seedContextualHistoryWorkspace } from './harness/contextualContentHistory';
import { expect, test } from './harness/fixtures';
import { openSettingsCategory } from './harness/settings';

const postKey = promisify(execFile);
const keyScript = fileURLToPath(new URL('./harness/systemImmersiveReadingKey.swift', import.meta.url));
const commandId = 'editor.toggleImmersiveMode';
const defaultLabel = '⌥ R';

function readAccelerator(app: ElectronApplication) {
  return app.evaluate(({ Menu }, id) => Menu.getApplicationMenu()?.getMenuItemById(id)?.accelerator, commandId);
}

async function openImmersiveShortcutSetting(page: Page) {
  const settings = await openSettingsCategory(page, 'Hotkeys');
  await settings.getByRole('searchbox', { name: 'Search hotkeys' }).fill('Immersive Reading');
  return settings.getByRole('button', { name: /^Shortcut for .*Immersive Reading$/i });
}

test('uses one native shortcut for Mac immersive reading, its help and its settings', async ({
  desktopApp,
  desktopWindow: page
}, testInfo) => {
  // SKIP: requires foreground macOS keyboard delivery | 2026-11-14 | revive: run in the macOS visible native lane
  test.skip(process.platform !== 'darwin' || process.env.FOLIOLE_ELECTRON_NATIVE_VISIBLE !== '1');
  await page.evaluate(() => localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await seedContextualHistoryWorkspace(page);

  const shortcutSetting = await openImmersiveShortcutSetting(page);
  await expect(shortcutSetting).toHaveText(defaultLabel);
  await testInfo.attach('immersive-hotkeys-setting', { body: await shortcutSetting.screenshot(), contentType: 'image/png' });
  await page.keyboard.press('Escape');
  await focusEditor(page);
  await expect.poll(() => readAccelerator(desktopApp)).toBe('Alt+R');

  const window = await desktopApp.browserWindow(page);
  const chrome = page.getByRole('region', { name: 'Left toolbar' });
  await expect(chrome).toBeVisible();
  await expect.poll(() => window.evaluate((target) => target.isFocused())).toBe(true);
  await postKey('swift', [keyScript], { timeout: 30_000 });
  await expect(chrome).toBeHidden();
  await page.keyboard.press('?');
  const help = page.getByLabel('Immersive reading shortcuts');
  await expect(help.getByText(defaultLabel)).toBeVisible();
  await testInfo.attach('immersive-shortcuts-help', { body: await help.screenshot(), contentType: 'image/png' });
  expect(await window.evaluate((target) => target.isFullScreen())).toBe(false);

  await expect.poll(() => window.evaluate((target) => target.isFocused())).toBe(true);
  await postKey('swift', [keyScript], { timeout: 30_000 });
  await expect(chrome).toBeVisible();
  expect(await window.evaluate((target) => target.isFullScreen())).toBe(false);
});
