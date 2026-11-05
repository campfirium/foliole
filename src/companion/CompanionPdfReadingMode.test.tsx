import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../shared/config/appSettings';

import { CompanionColorModeProvider } from './CompanionColorModeProvider';
import { ReadingFontSheet } from './CompanionReadingSheets';
import { DEFAULT_READING_TYPOGRAPHY_SETTINGS } from './companionReadingTypographySettings';
import { renderCompanionSettingsContent } from './CompanionSettingsShellContent';

let dark = false;
let refresh: () => void;
beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.pdfReadingMode;
  dark = false;
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return dark; },
    addEventListener: (_: string, handler: () => void) => { refresh = handler; },
    removeEventListener: vi.fn()
  }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function renderSettings() {
  return render(<CompanionColorModeProvider>{renderCompanionSettingsContent({
    settingsPage: 'appearance', onBackToSettingsList: vi.fn(), onOpenSyncSettings: vi.fn(),
    onOpenSyncSettingsPage: vi.fn(), workspaceSync: {} as never
  })}</CompanionColorModeProvider>);
}
const picker = () => screen.getByRole('combobox', { name: 'PDF in dark mode' });

it('defaults to warm and applies all choices only in dark mode through system and manual changes', () => {
  renderSettings();
  expect(picker()).toHaveValue('warm');
  expect(document.documentElement.dataset.pdfReadingMode).toBe('original');
  act(() => { dark = true; refresh(); });
  expect(document.documentElement.dataset.pdfReadingMode).toBe('warm');
  for (const mode of ['original', 'inverted', 'warm']) {
    fireEvent.change(picker(), { target: { value: mode } });
    expect(document.documentElement.dataset.pdfReadingMode).toBe(mode);
    expect(localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.pdfReadingMode)).toBe(mode);
  }
  fireEvent.click(screen.getByRole('button', { name: 'Light', exact: true }));
  expect(document.documentElement.dataset.pdfReadingMode).toBe('original');
  expect(picker()).toHaveValue('warm');
  fireEvent.click(screen.getByRole('button', { name: 'Dark', exact: true }));
  expect(document.documentElement.dataset.pdfReadingMode).toBe('warm');
});

it('saves from the reading sheet and restores the same preference in settings after remount', () => {
  localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.baseColor, 'dark');
  const view = render(<CompanionColorModeProvider>
    <ReadingFontSheet open onOpenChange={vi.fn()} onChange={vi.fn()} settings={DEFAULT_READING_TYPOGRAPHY_SETTINGS} />
  </CompanionColorModeProvider>);
  fireEvent.change(picker(), { target: { value: 'inverted' } });
  expect(localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.pdfReadingMode)).toBe('inverted');
  view.unmount();
  renderSettings();
  expect(picker()).toHaveValue('inverted');
  expect(document.documentElement.dataset.pdfReadingMode).toBe('inverted');
});

it('keeps the saved mode on write failure and can retry successfully', () => {
  localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.baseColor, 'dark');
  localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.pdfReadingMode, 'original');
  renderSettings();
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Unavailable'); });
  fireEvent.change(picker(), { target: { value: 'warm' } });
  expect(screen.getByRole('alert')).toHaveTextContent('Could not save reading settings');
  expect(picker()).toHaveValue('original');
  expect(document.documentElement.dataset.pdfReadingMode).toBe('original');
  expect(localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.pdfReadingMode)).toBe('original');
  write.mockRestore();
  fireEvent.change(picker(), { target: { value: 'warm' } });
  expect(document.documentElement.dataset.pdfReadingMode).toBe('warm');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('uses the shared default for an invalid saved PDF preference', () => {
  localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.baseColor, 'dark');
  localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.pdfReadingMode, 'invalid');
  renderSettings();
  expect(picker()).toHaveValue('warm');
  expect(document.documentElement.dataset.pdfReadingMode).toBe('warm');
});
