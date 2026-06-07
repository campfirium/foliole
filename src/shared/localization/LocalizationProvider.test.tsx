import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it } from 'vitest';

import { APP_LANGUAGE_STORAGE_KEY, resolveSystemAppLocale } from './appLanguage';
import { LocalizationProvider, useLocalization, useTranslation } from './LocalizationProvider';
import { preloadTranslationCatalog } from './translations';

function TranslationHarness() {
  const t = useTranslation();
  const { languagePreference, locale, setLanguagePreference, setLocale } = useLocalization();
  return (
    <>
      <p>{languagePreference}</p>
      <p>{locale}</p>
      <p>{t('settings.title')}</p>
      <p>{t('desktop.diagnostics.scheduling.priorityRatio')}</p>
      <p>{t('desktop.diagnostics.scheduling.priorityWeight')}</p>
      <p>{t('desktop.diagnostics.scheduling.growthFactor')}</p>
      <button onClick={() => setLocale('zh-Hans')} type="button">
        Switch
      </button>
      <button onClick={() => setLanguagePreference('system')} type="button">
        System
      </button>
    </>
  );
}

beforeAll(async () => {
  await preloadTranslationCatalog('zh-Hans');
});

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window.navigator, 'languages', {
    configurable: true,
    value: ['en-US']
  });
});

it('hydrates the saved app language and updates translated consumers', async () => {
  window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, 'zh-Hans');

  render(
    <LocalizationProvider>
      <TranslationHarness />
    </LocalizationProvider>
  );

  expect(await screen.findAllByText('zh-Hans')).toHaveLength(2);
  expect(screen.getByText('设置')).toBeInTheDocument();
  expect(screen.getByText('队列权重倍率')).toBeInTheDocument();
  expect(screen.getByText('当前队列权重')).toBeInTheDocument();
  expect(screen.getByText('阅读增长系数')).toBeInTheDocument();
});

it('defaults to system language and resolves supported Chinese locales', async () => {
  Object.defineProperty(window.navigator, 'languages', {
    configurable: true,
    value: ['zh-CN', 'en-US']
  });

  render(
    <LocalizationProvider>
      <TranslationHarness />
    </LocalizationProvider>
  );

  expect(await screen.findByText('system')).toBeInTheDocument();
  expect(screen.getByText('zh-Hans')).toBeInTheDocument();
  expect(screen.getByText('设置')).toBeInTheDocument();
  expect(window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)).toBeNull();
});

it('falls back to English when the system language is unsupported', () => {
  expect(resolveSystemAppLocale(['fr-FR'])).toBe('en');
});

it('persists language changes through the shared provider', async () => {
  render(
    <LocalizationProvider>
      <TranslationHarness />
    </LocalizationProvider>
  );

  fireEvent.click(screen.getByRole('button', { name: 'Switch' }));

  expect(await screen.findAllByText('zh-Hans')).toHaveLength(2);
  expect(screen.getByText('队列权重倍率')).toBeInTheDocument();
  expect(window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)).toBe('zh-Hans');
});

it('names scheduling diagnostics by their calculation roles', () => {
  render(
    <LocalizationProvider>
      <TranslationHarness />
    </LocalizationProvider>
  );

  expect(screen.getByText('Queue weight ratio')).toBeInTheDocument();
  expect(screen.getByText('Current queue weight')).toBeInTheDocument();
  expect(screen.getByText('Reading growth factor')).toBeInTheDocument();
});
