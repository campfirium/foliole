import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';

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
  await preloadTranslationCatalog('en');
  await preloadTranslationCatalog('zh-Hans');
});

beforeEach(() => {
  vi.unstubAllEnvs();
  window.localStorage.clear();
  Object.defineProperty(window.navigator, 'languages', {
    configurable: true,
    value: ['en-US']
  });
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: undefined });
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
    value: ['en-US']
  });
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      runtimeConfig: { guidedSampleLocale: null, systemLanguage: 'zh-Hans-CN' }
    }
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

it('allows an injected initial language without changing stored preferences', async () => {
  window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, 'zh-Hans');

  render(
    <LocalizationProvider initialLanguagePreference="en">
      <TranslationHarness />
    </LocalizationProvider>
  );

  expect(await screen.findAllByText('en')).toHaveLength(2);
  expect(screen.getByText('Settings')).toBeInTheDocument();
  expect(window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)).toBe('zh-Hans');
});

it('renders English while an on-demand catalog is loading', () => {
  render(
    <LocalizationProvider initialLanguagePreference="de">
      <TranslationHarness />
    </LocalizationProvider>
  );

  expect(screen.getByText('Settings')).toBeInTheDocument();
  expect(screen.getAllByText('de')).toHaveLength(2);
});

it('uses a registered primary system language and falls back when unsupported', () => {
  expect(resolveSystemAppLocale(['fr-FR'])).toBe('fr');
  expect(resolveSystemAppLocale(['nl-NL'])).toBe('en');
});

it('follows the primary browser language while System is selected', async () => {
  Object.defineProperty(window.navigator, 'languages', {
    configurable: true,
    value: ['ja-JP', 'en-US']
  });

  render(
    <LocalizationProvider>
      <TranslationHarness />
    </LocalizationProvider>
  );

  expect(await screen.findByText('system')).toBeInTheDocument();
  expect(screen.getByText('ja')).toBeInTheDocument();
  expect(await screen.findByText('設定')).toBeInTheDocument();
});

it('uses only the primary system language and requires explicit simplified Chinese', () => {
  expect(resolveSystemAppLocale(['ko-KR', 'zh-CN'])).toBe('ko');
  expect(resolveSystemAppLocale(['zh-TW'])).toBe('zh-Hant');
  expect(resolveSystemAppLocale(['zh-Hant'])).toBe('zh-Hant');
  expect(resolveSystemAppLocale(['zh'])).toBe('en');
  expect(resolveSystemAppLocale(['pt-PT'])).toBe('en');
  expect(resolveSystemAppLocale([])).toBe('en');
  expect(resolveSystemAppLocale(['zh-CN', 'ko-KR'])).toBe('zh-Hans');
});

it('allows a dev-only app language override without changing stored preferences', async () => {
  vi.stubEnv('VITE_FOLIOLE_DEV_APP_LANGUAGE', 'en');
  vi.stubEnv('VITE_FOLIOLE_INTERNAL_BUILD', '1');
  window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, 'zh-Hans');
  Object.defineProperty(window.navigator, 'languages', {
    configurable: true,
    value: ['zh-CN', 'en-US']
  });

  render(
    <LocalizationProvider>
      <TranslationHarness />
    </LocalizationProvider>
  );

  expect(await screen.findByText('Settings')).toBeInTheDocument();
  expect(screen.getByText('en')).toBeInTheDocument();
  expect(window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)).toBe('zh-Hans');
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
