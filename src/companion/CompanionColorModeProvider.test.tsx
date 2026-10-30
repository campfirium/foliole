import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../shared/config/appSettings';

import { CompanionColorModeProvider } from './CompanionColorModeProvider';
import { ReadingFontSheet } from './CompanionReadingSheets';
import { DEFAULT_READING_TYPOGRAPHY_SETTINGS } from './companionReadingTypographySettings';
import { renderCompanionSettingsContent } from './CompanionSettingsShellContent';

let systemDark = false;
let listeners: Set<() => void>;

beforeEach(() => {
  localStorage.clear();
  systemDark = false;
  listeners = new Set();
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return systemDark; },
    addEventListener: (_: string, handler: () => void) => listeners.add(handler),
    removeEventListener: (_: string, handler: () => void) => listeners.delete(handler)
  }));
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function setSystemDark(dark: boolean) {
  act(() => { systemDark = dark; listeners.forEach((handler) => handler()); });
}

function renderSettings() {
  return render(<CompanionColorModeProvider>{renderCompanionSettingsContent({
    settingsPage: 'appearance',
    onBackToSettingsList: vi.fn(),
    onOpenSyncSettings: vi.fn(),
    onOpenSyncSettingsPage: vi.fn(),
    workspaceSync: {} as never
  })}</CompanionColorModeProvider>);
}

it('offers system, light and dark in Appearance and follows live system changes by default', () => {
  renderSettings();
  expect(screen.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true');
  expect(document.documentElement.dataset.resolvedBaseColor).toBe('light');
  setSystemDark(true);
  expect(document.documentElement.dataset.resolvedBaseColor).toBe('dark');
  expect(document.documentElement.style.colorScheme).toBe('dark');
  setSystemDark(false);
  expect(document.documentElement.dataset.resolvedBaseColor).toBe('light');
});

it('keeps an explicit choice when the system changes and restores it after remount', () => {
  const view = renderSettings();
  fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
  expect(localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.baseColor)).toBe('dark');
  setSystemDark(true);
  setSystemDark(false);
  expect(document.documentElement.dataset.resolvedBaseColor).toBe('dark');
  view.unmount();
  renderSettings();
  expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
  expect(document.documentElement.dataset.resolvedBaseColor).toBe('dark');
  fireEvent.click(screen.getByRole('button', { name: 'Light' }));
  setSystemDark(true);
  expect(document.documentElement.dataset.resolvedBaseColor).toBe('light');
  fireEvent.click(screen.getByRole('button', { name: 'System' }));
  expect(document.documentElement.dataset.resolvedBaseColor).toBe('dark');
});

it('changes the global preference from the real reading Appearance sheet without changing typography', () => {
  const onChange = vi.fn();
  render(<CompanionColorModeProvider>
    <ReadingFontSheet open onOpenChange={vi.fn()} onChange={onChange} settings={DEFAULT_READING_TYPOGRAPHY_SETTINGS} />
  </CompanionColorModeProvider>);
  expect(screen.getByRole('dialog', { name: 'Appearance' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
  expect(document.documentElement.dataset.resolvedBaseColor).toBe('dark');
  expect(localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.baseColor)).toBe('dark');
  expect(onChange).not.toHaveBeenCalled();
});

it('keeps the previous mode and reports a storage write failure', () => {
  renderSettings();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
  fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Color mode could not be saved');
  expect(screen.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true');
  expect(document.documentElement.dataset.resolvedBaseColor).toBe('light');
});

it('uses system mode for invalid stored data and releases its system subscription', () => {
  localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.baseColor, 'invalid');
  systemDark = true;
  const view = renderSettings();
  expect(document.documentElement.dataset.resolvedBaseColor).toBe('dark');
  expect(listeners.size).toBe(1);
  view.unmount();
  expect(listeners.size).toBe(0);
});
