import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

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

async function renameEntry(page: Page, nodeId: string, currentName: string, nextName: string) {
  await page.locator(`[data-node-id="${nodeId}"]`).first().dblclick();
  const input = page.getByRole('textbox', { name: `Rename ${currentName}` });
  await input.fill(nextName);
  await input.press('Enter');
}

test('renames all system entries, restores them after renderer restart, and clears one override', async ({
  desktopWindow
}, testInfo) => {
  await switchToEnglish(desktopWindow);
  const pathsBefore = await desktopWindow.evaluate(() =>
    window.electronAPI?.invoke('load_library_path_settings', {})
  );
  for (const [id, defaultName, customName] of ENTRIES) {
    await renameEntry(desktopWindow, id, defaultName, `  ${customName}  `);
  }
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
  await desktopWindow.locator('[data-node-id="special-home"]').first().click();
  await expect(desktopWindow.getByRole('heading', { name: 'Start here' })).toBeVisible();
  expect(
    await desktopWindow.evaluate(() => window.electronAPI?.invoke('load_library_path_settings', {}))
  ).toEqual(pathsBefore);

  await mkdir(path.dirname(SCREENSHOT), { recursive: true });
  await desktopWindow.screenshot({ path: SCREENSHOT });
  await testInfo.attach('system-entry-display-names', { contentType: 'image/png', path: SCREENSHOT });
  await renameEntry(desktopWindow, 'special-home', 'Start here', '');
  await expectEntryNames(desktopWindow, [
    'Home',
    ...ENTRIES.slice(1).map(([, , customName]) => customName)
  ]);
  await expect(desktopWindow.getByRole('heading', { name: 'Home' })).toBeVisible();
});
