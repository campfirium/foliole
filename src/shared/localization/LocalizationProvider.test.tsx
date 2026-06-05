import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { APP_LANGUAGE_STORAGE_KEY } from './appLanguage';
import { LocalizationProvider, useLocalization, useTranslation } from './LocalizationProvider';

function TranslationHarness() {
  const t = useTranslation();
  const { locale, setLocale } = useLocalization();
  return (
    <>
      <p>{locale}</p>
      <p>{t('settings.title')}</p>
      <p>{t('desktop.diagnostics.scheduling.priorityRatio')}</p>
      <p>{t('desktop.diagnostics.scheduling.priorityWeight')}</p>
      <p>{t('desktop.diagnostics.scheduling.growthFactor')}</p>
      <button onClick={() => setLocale('zh-Hans')} type="button">
        Switch
      </button>
    </>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

it('hydrates the saved app language and updates translated consumers', () => {
  window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, 'zh-Hans');

  render(
    <LocalizationProvider>
      <TranslationHarness />
    </LocalizationProvider>
  );

  expect(screen.getByText('zh-Hans')).toBeInTheDocument();
  expect(screen.getByText('设置')).toBeInTheDocument();
  expect(screen.getByText('队列权重倍率')).toBeInTheDocument();
  expect(screen.getByText('当前队列权重')).toBeInTheDocument();
  expect(screen.getByText('阅读增长系数')).toBeInTheDocument();
});

it('persists language changes through the shared provider', () => {
  render(
    <LocalizationProvider>
      <TranslationHarness />
    </LocalizationProvider>
  );

  fireEvent.click(screen.getByRole('button', { name: 'Switch' }));

  expect(screen.getByText('zh-Hans')).toBeInTheDocument();
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
