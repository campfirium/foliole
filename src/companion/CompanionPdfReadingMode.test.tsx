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
const labels = { original: 'Original', inverted: 'Inverted', warm: 'Warm' } as const;
const option = (mode: keyof typeof labels) => screen.getByRole('radio', { name: labels[mode] });
const choose = (mode: keyof typeof labels) => fireEvent.click(option(mode));

it('defaults to warm and applies all choices only in dark mode through system and manual changes', () => {
  renderSettings();
  expect(option('warm')).toHaveAttribute('aria-checked', 'true');
  expect(document.documentElement.dataset.pdfReadingMode).toBe('original');
  act(() => { dark = true; refresh(); });
  expect(document.documentElement.dataset.pdfReadingMode).toBe('warm');
  for (const mode of ['original', 'inverted', 'warm'] as const) {
    choose(mode);
    expect(document.documentElement.dataset.pdfReadingMode).toBe(mode);
    expect(localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.pdfReadingMode)).toBe(mode);
  }
  fireEvent.click(screen.getByRole('button', { name: 'Light', exact: true }));
  expect(document.documentElement.dataset.pdfReadingMode).toBe('original');
  expect(option('warm')).toHaveAttribute('aria-checked', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Dark', exact: true }));
  expect(document.documentElement.dataset.pdfReadingMode).toBe('warm');
});

it('saves from the reading sheet and restores the same preference in settings after remount', () => {
  localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.baseColor, 'dark');
  const view = render(<CompanionColorModeProvider>
    <ReadingFontSheet open onOpenChange={vi.fn()} onChange={vi.fn()} settings={DEFAULT_READING_TYPOGRAPHY_SETTINGS} />
  </CompanionColorModeProvider>);
  choose('inverted');
  expect(localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.pdfReadingMode)).toBe('inverted');
  view.unmount();
  renderSettings();
  expect(option('inverted')).toHaveAttribute('aria-checked', 'true');
  expect(document.documentElement.dataset.pdfReadingMode).toBe('inverted');
});

it('keeps the saved mode on write failure and can retry successfully', () => {
  localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.baseColor, 'dark');
  localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.pdfReadingMode, 'original');
  renderSettings();
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Unavailable'); });
  choose('warm');
  expect(screen.getByRole('alert')).toHaveTextContent('Could not save reading settings');
  expect(option('original')).toHaveAttribute('aria-checked', 'true');
  expect(document.documentElement.dataset.pdfReadingMode).toBe('original');
  expect(localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.pdfReadingMode)).toBe('original');
  write.mockRestore();
  choose('warm');
  expect(document.documentElement.dataset.pdfReadingMode).toBe('warm');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('uses the shared default for an invalid saved PDF preference', () => {
  localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.baseColor, 'dark');
  localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.pdfReadingMode, 'invalid');
  renderSettings();
  expect(option('warm')).toHaveAttribute('aria-checked', 'true');
  expect(document.documentElement.dataset.pdfReadingMode).toBe('warm');
});

it('exposes all three PDF choices directly without a dropdown', () => {
  renderSettings();
  expect(screen.queryByRole('combobox', { name: 'PDF in dark mode' })).not.toBeInTheDocument();
  for (const mode of ['original', 'inverted', 'warm'] as const) expect(option(mode)).toBeVisible();
});
