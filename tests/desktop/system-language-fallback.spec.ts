import path from 'node:path';

import { expect } from '@playwright/test';

import { test } from './harness/fixtures';

const SCREENSHOT_PATH = path.resolve(
  '.tmp',
  'artifacts',
  'desktop-acceptance',
  'formal-locale-catalog-loading.png'
);

test('uses English for an unsupported primary language and loads an explicit formal locale', async ({
  desktopWindow
}, testInfo) => {
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

  const settingsButton = desktopWindow.getByRole('button', { name: 'Einstellungen' });
  await expect(settingsButton).toBeVisible();
  await settingsButton.click();
  await expect(desktopWindow.getByRole('dialog')).toBeVisible();
  await expect(desktopWindow.getByRole('navigation', { name: 'Einstellungsnavigation' })).toBeVisible();
  await desktopWindow.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('formal-locale-catalog-loading', {
    contentType: 'image/png',
    path: SCREENSHOT_PATH
  });
});
