import path from 'node:path';

import { expect } from '@playwright/test';

import { test } from './harness/fixtures';

const SCREENSHOT_PATH = path.resolve(
  '.tmp',
  'artifacts',
  'desktop-acceptance',
  'system-language-fallback-english.png'
);

test('uses English for an unsupported primary language and preserves an explicit choice', async ({
  desktopWindow
}, testInfo) => {
  await desktopWindow.evaluate(() => {
    window.localStorage.removeItem('foliole-app-language');
  });
  await desktopWindow.addInitScript(() => {
    Object.defineProperty(window.navigator, 'languages', {
      configurable: true,
      value: ['ko-KR', 'zh-CN']
    });
  });
  await desktopWindow.reload();

  await expect(desktopWindow.getByRole('button', { name: 'Settings' })).toBeVisible();
  await expect(desktopWindow.getByRole('button', { name: '设置' })).toHaveCount(0);
  await desktopWindow.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('system-language-fallback', {
    contentType: 'image/png',
    path: SCREENSHOT_PATH
  });

  await desktopWindow.evaluate(() => {
    window.localStorage.setItem('foliole-app-language', 'zh-Hans');
  });
  await desktopWindow.reload();

  await expect(desktopWindow.getByRole('button', { name: '设置' })).toBeVisible();
});
