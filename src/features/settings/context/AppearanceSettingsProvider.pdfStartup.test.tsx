import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import { AppearanceSettingsProvider, useAppearanceSettings } from './AppearanceSettingsProvider';

function ThemeToggleHarness() {
  const appearance = useAppearanceSettings();

  return (
    <button onClick={appearance.toggleBaseColorMode} type="button">
      Toggle light/dark
    </button>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-base-color');
  document.documentElement.removeAttribute('data-pdf-reading-mode');
  document.documentElement.removeAttribute('data-resolved-base-color');
  document.documentElement.removeAttribute('style');
});

it('restores light PDF surface tokens on the first switch after a dark inverted startup', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.baseColor, 'dark');
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.pdfReadingMode, 'inverted');
  document.documentElement.style.setProperty('--color-canvas', '24 25 24');
  document.documentElement.style.setProperty('--color-background', '20 21 20');
  document.documentElement.style.setProperty('--color-bg-panel', '37 40 36');

  render(
    <AppearanceSettingsProvider>
      <ThemeToggleHarness />
    </AppearanceSettingsProvider>
  );

  expect(document.documentElement.dataset.resolvedBaseColor).toBe('dark');
  expect(document.documentElement.dataset.pdfReadingMode).toBe('inverted');
  expect(document.documentElement.style.getPropertyValue('--color-canvas')).toBe('24 25 24');
  expect(document.documentElement.style.getPropertyValue('--workspace-region-main-document-bg')).toBe('#1f211f');

  fireEvent.click(screen.getByRole('button', { name: 'Toggle light/dark' }));

  expect(document.documentElement.dataset.resolvedBaseColor).toBe('light');
  expect(document.documentElement.dataset.pdfReadingMode).toBe('original');
  expect(document.documentElement.style.getPropertyValue('--color-canvas')).toBe('255 255 255');
  expect(document.documentElement.style.getPropertyValue('--color-background')).toBe('245 245 243');
  expect(document.documentElement.style.getPropertyValue('--color-bg-panel')).toBe('246 246 246');
  expect(document.documentElement.style.getPropertyValue('--workspace-region-main-document-bg')).toBe('#ffffff');
});
