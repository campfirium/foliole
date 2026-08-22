import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const SCREENSHOT = path.resolve(
  '.tmp/artifacts/desktop-acceptance/system-entry-display-names.png'
);
const ENTRIES = [
  ['special-home', 'Home', 'Start here'],
  ['special-inbox', 'Inbox', 'Incoming'],
  ['special-trash', 'Trash', 'Bin'],
  ['special-virtual-root', 'Virtual folders', 'Smart views'],
  ['special-virtual-published', 'Published', 'Shared'],
  ['special-virtual-shelved', 'Shelved', 'Later'],
  ['special-virtual-removed', 'Removed', 'Hidden']
] as const;

async function switchToEnglish(page: Page) {
  await page.evaluate(async () => {
    const settings = (await window.electronAPI?.invoke('load_app_settings_state', {})) ?? {};
    await window.electronAPI?.invoke('save_app_settings_state', {
      settings: { ...settings, 'foliole-app-language': 'en' }
    });
    window.localStorage.setItem('foliole-app-language', 'en');
  });
  await page.reload();
  await expectWorkspaceShell(page);
}

async function expectEntryNames(page: Page, names: readonly string[]) {
  for (const [index, [id]] of ENTRIES.entries()) {
    await expect(page.locator(`[data-node-id="${id}"]`).first()).toContainText(names[index]);
  }
}

test('renames all system entries, restores them after renderer restart, and clears one override', async ({
  desktopWindow
}, testInfo) => {
  await switchToEnglish(desktopWindow);
  const pathsBefore = await desktopWindow.evaluate(() =>
    window.electronAPI?.invoke('load_library_path_settings', {})
  );
  const general = await openSettingsCategory(desktopWindow, 'General');
  for (const [, defaultName, customName] of ENTRIES) {
    const input = general.getByRole('textbox', { name: `Custom name for ${defaultName}` });
    await input.fill(`  ${customName}  `);
    await input.blur();
    await expect(input).toHaveValue(customName);
  }
  await desktopWindow.keyboard.press('Escape');
  await expect(general).toBeHidden();
  await expectEntryNames(
    desktopWindow,
    ENTRIES.map(([, , customName]) => customName)
  );

  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await expectEntryNames(
    desktopWindow,
    ENTRIES.map(([, , customName]) => customName)
  );
  expect(
    await desktopWindow.evaluate(() => window.electronAPI?.invoke('load_library_path_settings', {}))
  ).toEqual(pathsBefore);

  const reopened = await openSettingsCategory(desktopWindow, 'General');
  await mkdir(path.dirname(SCREENSHOT), { recursive: true });
  await reopened.screenshot({ path: SCREENSHOT });
  await testInfo.attach('system-entry-display-names', { contentType: 'image/png', path: SCREENSHOT });
  await reopened.getByRole('textbox', { name: 'Custom name for Home' }).fill('');
  await reopened.getByRole('textbox', { name: 'Custom name for Home' }).blur();
  await desktopWindow.keyboard.press('Escape');
  await expect(reopened).toBeHidden();
  await expectEntryNames(desktopWindow, [
    'Home',
    ...ENTRIES.slice(1).map(([, , customName]) => customName)
  ]);
});
