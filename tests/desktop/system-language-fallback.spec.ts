import path from 'node:path';

import { expect } from '@playwright/test';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { test } from './harness/fixtures';

const SCREENSHOT_PATH = path.resolve(
  '.tmp',
  'artifacts',
  'desktop-acceptance',
  'formal-locale-catalog-loading.png'
);

test('uses English for an unsupported primary language and persists a formal locale selected in settings', async ({
  desktopSession,
  desktopWindow
}, testInfo) => {
  let secondSession: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;
  try {
    await desktopWindow.evaluate(() => {
      window.localStorage.removeItem('foliole-app-language');
    });
    await desktopWindow.addInitScript(() => {
      Object.defineProperty(window.navigator, 'languages', {
        configurable: true,
        value: ['nl-NL', 'zh-CN']
      });
    });
    await desktopWindow.reload();

    await expect(desktopWindow.getByRole('button', { name: 'Settings' })).toBeVisible();
    await expect(desktopWindow.getByRole('button', { name: 'Einstellungen' })).toHaveCount(0);

    await desktopWindow.evaluate(() => {
      window.localStorage.setItem('foliole-app-language', 'de');
    });
    await desktopWindow.reload();

    await desktopWindow.getByRole('button', { name: 'Einstellungen', exact: true }).click();
    const dialog = desktopWindow.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Allgemein', exact: true }).click();
    const language = dialog.getByRole('combobox', { name: 'App-Sprache' });
    await expect(language).toHaveValue('de');
    await expect.poll(() => language.evaluate((element) => (element as HTMLSelectElement).options.length)).toBe(13);
    const saved = desktopWindow.evaluate(() => new Promise<void>((resolve) => {
      window.addEventListener('foliole:runtime-app-settings-saved', () => resolve(), { once: true });
    }));
    await language.selectOption('ja');
    await saved;
    await expect(dialog.getByRole('combobox', { name: 'アプリ言語' })).toHaveValue('ja');
    await desktopWindow.screenshot({ path: SCREENSHOT_PATH });

    await desktopSession.electronApp.close();
    secondSession = await launchDesktopSession({ env: desktopSession.launchOptions.env });
    const restoredSettingsButton = secondSession.firstWindow.getByRole('button', { name: '設定', exact: true });
    await expect(restoredSettingsButton).toBeVisible();
    await restoredSettingsButton.click();
    const restoredDialog = secondSession.firstWindow.getByRole('dialog');
    await restoredDialog.getByRole('button', { name: '一般', exact: true }).click();
    await expect(restoredDialog.getByRole('combobox', { name: 'アプリ言語' })).toHaveValue('ja');
    await testInfo.attach('formal-locale-catalog-loading', {
      contentType: 'image/png',
      path: SCREENSHOT_PATH
    });
  } finally {
    await secondSession?.close();
  }
});
