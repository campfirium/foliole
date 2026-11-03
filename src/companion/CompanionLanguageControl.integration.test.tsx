import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';

import { APP_LANGUAGE_OPTIONS, APP_LANGUAGE_STORAGE_KEY } from '../shared/localization/appLanguage';
import { LocalizationProvider, useTranslation } from '../shared/localization/LocalizationProvider';
import { preloadTranslationCatalog } from '../shared/localization/translations';

import { renderCompanionSettingsContent } from './CompanionSettingsShellContent';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';

function Settings() {
  const [page, setPage] = useState<CompanionSettingsPage>('list');
  const t = useTranslation();
  return <>
    <output>{t('settings.title')}</output>
    <button onClick={() => setPage('list')} type="button">Close detail</button>
    {renderCompanionSettingsContent({
      onBackToSettingsList: () => setPage('list'),
      onOpenSyncSettings: () => setPage('sync'),
      onOpenSyncSettingsPage: setPage,
      settingsPage: page,
      workspaceSync: { state: { sync_onboarding_status: 'pending' } } as never
    })}
  </>;
}

function openSettings() {
  const view = render(<LocalizationProvider><Settings /></LocalizationProvider>);
  fireEvent.click(screen.getByTestId('companion-settings-appearance'));
  return view;
}

beforeAll(async () => {
  await preloadTranslationCatalog('en');
  await preloadTranslationCatalog('zh-Hans');
});
beforeEach(() => {
  localStorage.clear();
  vi.unstubAllEnvs();
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: undefined });
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
});
afterEach(() => vi.restoreAllMocks());

it('switches current and newly opened settings, persists through restart, and restores System', () => {
  const view = openSettings();
  const select = screen.getByRole('combobox', { name: 'App language' });
  expect(select).toHaveValue('system');
  expect(Array.from((select as HTMLSelectElement).options, ({ value }) => value))
    .toEqual(['system', ...APP_LANGUAGE_OPTIONS.map(({ value }) => value)]);
  fireEvent.change(select, { target: { value: 'zh-Hans' } });
  expect(screen.getByRole('status')).toHaveTextContent('设置');
  expect(screen.getByRole('combobox', { name: '应用语言' })).toHaveValue('zh-Hans');
  expect(localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)).toBe('zh-Hans');
  fireEvent.click(screen.getByRole('button', { name: 'Close detail' }));
  fireEvent.click(screen.getByTestId('companion-settings-appearance'));
  expect(screen.getByRole('combobox', { name: '应用语言' })).toHaveValue('zh-Hans');
  view.unmount();
  const restarted = openSettings();
  expect(screen.getByRole('combobox', { name: '应用语言' })).toHaveValue('zh-Hans');
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'system' } });
  expect(screen.getByRole('status')).toHaveTextContent('Settings');
  expect(localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)).toBe('system');
  restarted.unmount();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['zh-CN']);
  openSettings();
  expect(screen.getByRole('combobox', { name: '应用语言' })).toHaveValue('system');
  expect(screen.getByRole('status')).toHaveTextContent('设置');
});

it('defaults to English for an unsupported system language without changing the system', () => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['nl-NL']);
  openSettings();
  expect(screen.getByRole('combobox', { name: 'App language' })).toHaveValue('system');
  expect(screen.getByRole('status')).toHaveTextContent('Settings');
  expect(navigator.languages).toEqual(['nl-NL']);
  expect(localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)).toBeNull();
});

it('keeps the previous language and saved preference on failure and permits retry', () => {
  openSettings();
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('storage unavailable');
  });
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zh-Hans' } });
  expect(screen.getByRole('alert')).toHaveTextContent('App language could not be saved');
  expect(screen.getByRole('combobox')).toHaveValue('system');
  expect(screen.getByRole('status')).toHaveTextContent('Settings');
  expect(localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)).toBeNull();
  write.mockRestore();
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zh-Hans' } });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('设置');
  expect(localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)).toBe('zh-Hans');
});
