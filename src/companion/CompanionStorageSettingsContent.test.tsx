import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import { preloadTranslationCatalog } from '../shared/localization/translations';

const clearCompanionAppData = vi.hoisted(() => vi.fn(async () => undefined));
const reload = vi.hoisted(() => vi.fn());

vi.mock('../shared/platform/companionAppData', () => ({
  clearCompanionAppData
}));

import { COMPANION_CUSTOM_CSS_STORAGE_KEY } from './companionCustomCssStorage';
import { CompanionStorageSettingsContent } from './CompanionStorageSettingsContent';

beforeEach(() => {
  clearCompanionAppData.mockReset();
  clearCompanionAppData.mockResolvedValue(undefined);
  reload.mockClear();
  window.localStorage.setItem(COMPANION_CUSTOM_CSS_STORAGE_KEY, '{"version":1,"snippets":[]}');
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload }
  });
});

it('requires confirmation before clearing app data', async () => {
  render(<CompanionStorageSettingsContent />);

  fireEvent.click(screen.getByRole('button', { name: 'Clear App Data' }));
  expect(clearCompanionAppData).not.toHaveBeenCalled();

  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Clear App Data' }));

  await waitFor(() => expect(clearCompanionAppData).toHaveBeenCalled());
  expect(window.localStorage.getItem(COMPANION_CUSTOM_CSS_STORAGE_KEY)).toBeNull();
  expect(reload).toHaveBeenCalled();
});

it('keeps the custom style cache when clearing app data fails', async () => {
  clearCompanionAppData.mockRejectedValue(new Error('Clear failed'));
  render(<CompanionStorageSettingsContent />);

  fireEvent.click(screen.getByRole('button', { name: 'Clear App Data' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Clear App Data' }));

  expect(await screen.findByText('Clear failed')).toBeInTheDocument();
  expect(window.localStorage.getItem(COMPANION_CUSTOM_CSS_STORAGE_KEY)).not.toBeNull();
  expect(reload).not.toHaveBeenCalled();
});

it.each([
  { locale: 'en', clear: 'Clear App Data', cancel: 'Cancel', risks: [/permanently/i, /only on this device/i, /not been synced/i] },
  { locale: 'zh-Hans', clear: '清除应用数据', cancel: '取消', risks: [/永久/, /仅存于本机/, /尚未同步/] }
] as const)('explains local data loss in $locale and allows cancellation', async ({ locale, clear, cancel, risks }) => {
  await preloadTranslationCatalog(locale);
  render(<LocalizationProvider initialLanguagePreference={locale}><CompanionStorageSettingsContent /></LocalizationProvider>);

  fireEvent.click(screen.getByRole('button', { name: clear }));
  const dialog = await screen.findByRole('dialog');
  for (const risk of risks) expect(dialog).toHaveTextContent(risk);
  expect(clearCompanionAppData).not.toHaveBeenCalled();

  fireEvent.click(within(dialog).getByRole('button', { name: cancel }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(clearCompanionAppData).not.toHaveBeenCalled();
  expect(window.localStorage.getItem(COMPANION_CUSTOM_CSS_STORAGE_KEY)).not.toBeNull();
  expect(reload).not.toHaveBeenCalled();
});
