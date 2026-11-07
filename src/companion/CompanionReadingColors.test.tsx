import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../shared/config/appSettings';
import { DEFAULT_APPEARANCE_COLORS } from '../shared/config/defaultAppearanceColors';

import { CompanionColorModeProvider } from './CompanionColorModeProvider';
import { renderCompanionSettingsContent } from './CompanionSettingsShellContent';

const colors = [
  ['Accent color', 'accentColor', '--app-accent-color', 'accent'],
  ['Font color', 'fontColor', '--color-foreground', 'font'],
  ['Selection color', 'selectionColor', '--app-selection-color', 'selection'],
  ['Highlight color', 'highlightColor', '--app-highlight-color', 'highlight'],
  ['Cloze color', 'clozeColor', '--app-cloze-color', 'cloze']
] as const;
let dark = false;
let refreshSystem: () => void;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('style');
  dark = false;
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return dark; },
    addEventListener: (_: string, listener: () => void) => { refreshSystem = listener; },
    removeEventListener: vi.fn()
  }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function mount() {
  return render(<CompanionColorModeProvider>
    {renderCompanionSettingsContent({ settingsPage: 'appearance', onBackToSettingsList: vi.fn(),
      onOpenSyncSettings: vi.fn(), onOpenSyncSettingsPage: vi.fn(), workspaceSync: {} as never })}
  </CompanionColorModeProvider>);
}

it('edits all reading colors, retains separate themes and restores them in Appearance settings', () => {
  const view = mount();
  for (const [label, key, css] of colors) {
    fireEvent.change(screen.getByLabelText(`${label} picker`), { target: { value: '#123456' } });
    expect(localStorage.getItem(APP_SETTINGS_STORAGE_KEYS[key])).toBe('#123456');
    expect(document.documentElement.style.getPropertyValue(css)).toBe(css === '--color-foreground' ? '18 52 86' : '#123456');
  }
  fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
  for (const [label, key] of colors) {
    fireEvent.change(screen.getByLabelText(`${label} picker`), { target: { value: '#abcdef' } });
    expect(localStorage.getItem(APP_SETTINGS_STORAGE_KEYS[`${key}Dark`])).toBe('#abcdef');
    expect(localStorage.getItem(APP_SETTINGS_STORAGE_KEYS[key])).toBe('#123456');
  }
  view.unmount();
  mount();
  for (const [label] of colors) expect(screen.getByLabelText(`${label} picker`)).toHaveValue('#abcdef');
  fireEvent.click(screen.getByRole('button', { name: 'Light' }));
  for (const [label] of colors) expect(screen.getByLabelText(`${label} picker`)).toHaveValue('#123456');
  expect(document.documentElement.style.getPropertyValue('--app-highlight-surface-color')).toContain('18 52 86');
  expect(document.documentElement.style.getPropertyValue('--app-cloze-surface-color')).toContain('18 52 86');
});

it('follows system theme and resets only the current theme to desktop defaults', () => {
  mount();
  for (const [label] of colors) {
    fireEvent.change(screen.getByLabelText(`${label} picker`), { target: { value: '#123456' } });
  }
  act(() => { dark = true; refreshSystem(); });
  for (const [label, , , defaultKey] of colors) {
    expect(screen.getByLabelText(`${label} picker`)).toHaveValue(DEFAULT_APPEARANCE_COLORS.dark[defaultKey]);
    fireEvent.change(screen.getByLabelText(`${label} picker`), { target: { value: '#abcdef' } });
    fireEvent.click(screen.getByRole('button', { name: `Reset ${label.toLowerCase()}` }));
    expect(screen.getByLabelText(`${label} picker`)).toHaveValue(DEFAULT_APPEARANCE_COLORS.dark[defaultKey]);
  }
  act(() => { dark = false; refreshSystem(); });
  for (const [label] of colors) expect(screen.getByLabelText(`${label} picker`)).toHaveValue('#123456');
});

it('keeps the confirmed color on write failure and allows retry', () => {
  mount();
  const input = screen.getByLabelText('Accent color picker');
  fireEvent.change(input, { target: { value: '#123456' } });
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  fireEvent.change(input, { target: { value: '#abcdef' } });
  expect(screen.getByRole('alert')).toHaveTextContent('Could not save reading settings');
  expect(input).toHaveValue('#123456');
  expect(localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.accentColor)).toBe('#123456');
  expect(document.documentElement.style.getPropertyValue('--app-accent-color')).toBe('#123456');
  write.mockRestore();
  fireEvent.change(input, { target: { value: '#abcdef' } });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(input).toHaveValue('#abcdef');
});

it('keeps detailed color editing out of the mobile settings list', () => {
  mount();
  expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  for (const [label] of colors) {
    expect(screen.getByLabelText(`${label} picker`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Reset ${label.toLowerCase()}` })).toBeInTheDocument();
  }
});
