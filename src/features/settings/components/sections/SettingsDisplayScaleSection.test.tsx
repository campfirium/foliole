import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../../shared/config/appSettings';
import { renderWithLocalization } from '../../../../shared/localization/testLocalization';
import type { ElectronAPI } from '../../../../shared/platform/electronApi';
import { DisplayScaleProvider } from '../../context/DisplayScaleProvider';

import { SettingsDisplayScaleSection } from './SettingsDisplayScaleSection';

beforeEach(() => {
  window.localStorage.clear();
  delete window.electronAPI;
  document.documentElement.style.removeProperty('-webkit-font-smoothing');
});

afterEach(() => vi.restoreAllMocks());

it('previews range input without committing app zoom until native change', () => {
  renderWithLocalization(
    <DisplayScaleProvider>
      <SettingsDisplayScaleSection />
    </DisplayScaleProvider>
  );
  const slider = screen.getByRole('slider');

  fireEvent.input(slider, { target: { value: '130' } });
  expect(slider).toHaveValue('130');
  expect(screen.getByText('130%')).toBeInTheDocument();
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.appDisplayScalePercent)).toBeNull();

  fireEvent.change(slider, { target: { value: '130' } });
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.appDisplayScalePercent)).toBe('130');
});

it('shows the macOS Electron font smoothing switch and applies its persisted value', () => {
  vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel');
  window.electronAPI = { invoke: vi.fn() } as unknown as ElectronAPI;

  renderWithLocalization(
    <DisplayScaleProvider>
      <SettingsDisplayScaleSection />
    </DisplayScaleProvider>
  );

  const fontSmoothing = screen.getByRole('switch', { name: 'Font smoothing' });
  expect(fontSmoothing).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByText('Use native macOS font anti-aliasing')).toBeInTheDocument();
  expect(document.documentElement.style.getPropertyValue('-webkit-font-smoothing')).toBe('antialiased');

  fireEvent.click(fontSmoothing);
  expect(fontSmoothing).toHaveAttribute('aria-checked', 'false');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.macOsFontSmoothing)).toBe('false');
  expect(document.documentElement.style.getPropertyValue('-webkit-font-smoothing')).toBe('');

  fireEvent.click(fontSmoothing);
  expect(fontSmoothing).toHaveAttribute('aria-checked', 'true');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.macOsFontSmoothing)).toBe('true');
  expect(document.documentElement.style.getPropertyValue('-webkit-font-smoothing')).toBe('antialiased');
});

it('hides the font smoothing switch outside macOS Electron', () => {
  renderWithLocalization(
    <DisplayScaleProvider>
      <SettingsDisplayScaleSection />
    </DisplayScaleProvider>
  );

  expect(screen.queryByRole('switch', { name: 'Font smoothing' })).not.toBeInTheDocument();
});
