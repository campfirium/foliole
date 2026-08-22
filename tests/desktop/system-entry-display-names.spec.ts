import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import type { DesktopSession } from './harness/fixtures';
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

function expectPathInsideStateRoot(candidate: string, stateRoot: string) {
  const relative = path.relative(path.resolve(stateRoot), path.resolve(candidate));
  expect(relative).not.toBe('..');
  expect(relative.startsWith(`..${path.sep}`)).toBe(false);
  expect(path.isAbsolute(relative)).toBe(false);
}

async function assertIsolatedLibrary(
  desktopApp: ElectronApplication,
  desktopSession: DesktopSession,
  page: Page
) {
  const runtime = await desktopApp.evaluate(() => ({
    libraryHome: process.env.FOLIOLE_LIBRARY_HOME ?? null,
    stateRoot: process.env.FOLIOLE_ELECTRON_TEST_STATE_ROOT ?? null
  }));
  if (!runtime.libraryHome || !runtime.stateRoot) {
    throw new Error('Refusing system entry rename acceptance without an isolated test library.');
  }
  expect(path.resolve(runtime.stateRoot)).toBe(path.resolve(desktopSession.target.runtimeStateRoot));
  expectPathInsideStateRoot(runtime.libraryHome, runtime.stateRoot);
  const libraryPaths = await page.evaluate(() =>
    window.electronAPI?.invoke('load_library_path_settings', {})
  );
  if (!libraryPaths || typeof libraryPaths.database_path !== 'string') {
    throw new Error('Refusing system entry rename acceptance without a resolved test database.');
  }
  expectPathInsideStateRoot(libraryPaths.database_path, runtime.stateRoot);
}

async function switchLanguage(page: Page, language: 'en' | 'zh-Hans') {
  await page.evaluate(async (language) => {
    const settings = (await window.electronAPI?.invoke('load_app_settings_state', {})) ?? {};
    await window.electronAPI?.invoke('save_app_settings_state', {
      settings: { ...settings, 'foliole-app-language': language }
    });
    window.localStorage.setItem('foliole-app-language', language);
  }, language);
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
  desktopApp,
  desktopSession,
  desktopWindow
}, testInfo) => {
  await assertIsolatedLibrary(desktopApp, desktopSession, desktopWindow);
  await switchLanguage(desktopWindow, 'en');
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

  await renameEntry(desktopWindow, 'special-home', 'Start here', '');
  await expectEntryNames(desktopWindow, [
    'Home',
    ...ENTRIES.slice(1).map(([, , customName]) => customName)
  ]);
  await expect(desktopWindow.getByRole('heading', { name: 'Home' })).toBeVisible();

  await switchLanguage(desktopWindow, 'zh-Hans');
  await desktopWindow.locator('[data-node-id="special-virtual-root"]').first().click({ button: 'right' });
  await expect(desktopWindow.getByRole('menuitem', { name: '重命名' })).toBeVisible();
  await expect(desktopWindow.getByRole('menuitem', { name: 'Rename' })).toHaveCount(0);
  await mkdir(path.dirname(SCREENSHOT), { recursive: true });
  await desktopWindow.screenshot({ path: SCREENSHOT });
  await testInfo.attach('system-entry-display-names', { contentType: 'image/png', path: SCREENSHOT });
});
