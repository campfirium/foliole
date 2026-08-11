import path from 'node:path';

import { expect } from '@playwright/test';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';
import { resolveSystemAppLocale } from '../../src/shared/localization/appLanguage';
import { preloadTranslationCatalog, translate } from '../../src/shared/localization/translations';

import { test } from './harness/fixtures';

const SCREENSHOT_PATH = path.resolve(
  '.tmp',
  'artifacts',
  'desktop-acceptance',
  'system-language-host-preference.png'
);

async function resolveSystemLabels(systemLanguage: string) {
  const locale = resolveSystemAppLocale(systemLanguage ? [systemLanguage] : []);
  await preloadTranslationCatalog(locale);
  return {
    appLanguage: translate(locale, 'settings.general.language.aria'),
    general: translate(locale, 'settings.category.general.label'),
    settings: translate(locale, 'settings.title')
  };
}

test('uses the host primary language, preserves a manual language, and returns to System immediately', async ({
  desktopSession,
  desktopWindow
}, testInfo) => {
  let restartedSession: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;
  const systemLanguage = await desktopSession.electronApp.evaluate(({ app }) =>
    app.getPreferredSystemLanguages()[0]?.trim() ?? ''
  );
  const systemLabels = await resolveSystemLabels(systemLanguage);
  try {
    await expect.poll(() => desktopWindow.evaluate(() =>
      window.electronAPI?.runtimeConfig?.systemLanguage ?? null
    )).toBe(systemLanguage || null);

    await desktopWindow.evaluate(() => window.localStorage.removeItem('foliole-app-language'));
    await desktopWindow.reload();
    await desktopWindow.getByRole('button', { name: systemLabels.settings, exact: true }).click();
    let dialog = desktopWindow.getByRole('dialog');
    await dialog.getByRole('button', { name: systemLabels.general, exact: true }).click();
    let language = dialog.getByRole('combobox', { name: systemLabels.appLanguage });
    await expect(language).toHaveValue('system');

    const manualSaved = desktopWindow.evaluate(() => new Promise<void>((resolve) => {
      window.addEventListener('foliole:runtime-app-settings-saved', () => resolve(), { once: true });
    }));
    await language.selectOption('ja');
    await manualSaved;
    await expect(dialog.getByRole('combobox', { name: 'アプリ言語' })).toHaveValue('ja');

    await desktopSession.electronApp.close();
    restartedSession = await launchDesktopSession({ env: desktopSession.launchOptions.env });
    await restartedSession.firstWindow.getByRole('button', { name: '設定', exact: true }).click();
    dialog = restartedSession.firstWindow.getByRole('dialog');
    await dialog.getByRole('button', { name: '一般', exact: true }).click();
    language = dialog.getByRole('combobox', { name: 'アプリ言語' });
    await expect(language).toHaveValue('ja');

    const systemSaved = restartedSession.firstWindow.evaluate(() => new Promise<void>((resolve) => {
      window.addEventListener('foliole:runtime-app-settings-saved', () => resolve(), { once: true });
    }));
    await language.selectOption('system');
    await systemSaved;
    await expect(dialog.getByRole('combobox', { name: systemLabels.appLanguage })).toHaveValue('system');
    await restartedSession.firstWindow.screenshot({ path: SCREENSHOT_PATH });
    await testInfo.attach('system-language-host-preference', {
      contentType: 'image/png',
      path: SCREENSHOT_PATH
    });
  } finally {
    await restartedSession?.close();
  }
});
