import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SCREENSHOT = path.resolve('.tmp/artifacts/system-entry-localization-hidden-native.png');

const EXPECTED = {
  en: {
    commandPalette: 'Command Palette',
    entries: ['Home', 'Inbox', 'Trash', 'Virtual folders', 'Published', 'Shelved', 'Removed'],
    openTrash: 'Open Trash',
    search: 'Search'
  },
  de: {
    commandPalette: 'Befehlspalette',
    entries: ['Start', 'Eingang', 'Papierkorb', 'Virtuelle Ordner', 'Veröffentlicht', 'Zurückgestellt', 'Entfernt'],
    openTrash: 'Papierkorb öffnen',
    search: 'Suchen'
  },
  'zh-Hans': {
    commandPalette: '命令面板',
    entries: ['Home', '收件箱', '回收站', '虚拟文件夹', '发布', '搁置', '移除'],
    openTrash: '打开回收站',
    search: '搜索'
  }
} as const;

async function switchLocale(page: Page, locale: keyof typeof EXPECTED) {
  await page.evaluate(async (nextLocale) => {
    const settings = await window.electronAPI?.invoke('load_app_settings_state', {}) ?? {};
    await window.electronAPI?.invoke('save_app_settings_state', {
      settings: { ...settings, 'foliole-app-language': nextLocale }
    });
    window.localStorage.setItem('foliole-app-language', nextLocale);
  }, locale);
  await page.reload();
  await expectWorkspaceShell(page);
}

async function expectLocalizedEntries(page: Page, locale: keyof typeof EXPECTED) {
  const ids = [
    'special-home',
    'special-inbox',
    'special-trash',
    'special-virtual-root',
    'special-virtual-published',
    'special-virtual-shelved',
    'special-virtual-removed'
  ];
  for (const [index, id] of ids.entries()) {
    await expect(page.locator(`[data-node-id="${id}"]`).first()).toContainText(EXPECTED[locale].entries[index]);
  }
}

async function expectLocalizedCommand(page: Page, locale: keyof typeof EXPECTED) {
  const toolbar = page.getByRole('region', { name: /Left toolbar|左侧工具栏|Linke Symbolleiste/ });
  await toolbar.getByRole('button', { name: EXPECTED[locale].commandPalette, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /Command palette|命令面板|Befehlspalette/ });
  await expect(dialog.getByRole('button', { name: EXPECTED[locale].openTrash, exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
}

test('localizes every system entry and its command reference across representative locales', async ({
  desktopWindow
}, testInfo) => {
  for (const locale of ['en', 'zh-Hans', 'de'] as const) {
    await switchLocale(desktopWindow, locale);
    await expectLocalizedEntries(desktopWindow, locale);
    await expectLocalizedCommand(desktopWindow, locale);
  }

  const toolbar = desktopWindow.getByRole('region', { name: /Linke Symbolleiste|Left toolbar/ });
  await expect(toolbar.getByRole('button', { name: EXPECTED.de.search, exact: true })).toBeVisible();
  await mkdir(path.dirname(SCREENSHOT), { recursive: true });
  await desktopWindow.screenshot({ fullPage: true, path: SCREENSHOT });
  await testInfo.attach('system-entry-localization-hidden-native', { contentType: 'image/png', path: SCREENSHOT });
});
