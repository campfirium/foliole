import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import { AppearanceSettingsProvider, useAppearanceSettings } from './AppearanceSettingsProvider';

function AppearanceHarness() {
  const appearance = useAppearanceSettings();

  return (
    <>
      <div>{appearance.editorDisplayMode}</div>
      <div>{appearance.markdownSyntaxVisibility}</div>
      <div>{appearance.baseColorMode}</div>
      <div>{appearance.dimImagesInDarkMode ? 'dim-on' : 'dim-off'}</div>
      <div>{appearance.pdfReadingMode}</div>
      <button onClick={appearance.toggleEditorDisplayMode} type="button">
        Toggle mode
      </button>
      <button onClick={() => appearance.setMarkdownSyntaxVisibility('visible')} type="button">
        Show syntax
      </button>
      <button onClick={() => appearance.setPdfReadingMode('warm')} type="button">
        Warm PDF
      </button>
      <button onClick={appearance.toggleBaseColorMode} type="button">
        Toggle light/dark
      </button>
      <button onClick={() => appearance.setDimImagesInDarkMode(true)} type="button">
        Dim images
      </button>
    </>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

it('hydrates saved appearance settings and persists updates through the shared provider', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.editorDisplayMode, 'source');

  render(
    <AppearanceSettingsProvider>
      <AppearanceHarness />
    </AppearanceSettingsProvider>
  );

  expect(screen.getByText('source')).toBeInTheDocument();
  expect(screen.getByText('hidden')).toBeInTheDocument();
  expect(screen.getByText('light')).toBeInTheDocument();
  expect(screen.getByText('dim-off')).toBeInTheDocument();
  expect(screen.getByText('inverted')).toBeInTheDocument();
  expect(document.documentElement.dataset.dimImagesInDarkMode).toBe('false');
  expect(document.documentElement.dataset.pdfReadingMode).toBe('inverted');

  fireEvent.click(screen.getByRole('button', { name: 'Toggle mode' }));
  fireEvent.click(screen.getByRole('button', { name: 'Show syntax' }));
  fireEvent.click(screen.getByRole('button', { name: 'Warm PDF' }));
  fireEvent.click(screen.getByRole('button', { name: 'Toggle light/dark' }));
  fireEvent.click(screen.getByRole('button', { name: 'Dim images' }));

  expect(screen.getByText('preview')).toBeInTheDocument();
  expect(screen.getByText('visible')).toBeInTheDocument();
  expect(screen.getByText('dark')).toBeInTheDocument();
  expect(screen.getByText('dim-on')).toBeInTheDocument();
  expect(screen.getByText('warm')).toBeInTheDocument();
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.editorDisplayMode)).toBe('preview');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility)).toBe('visible');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.baseColor)).toBe('dark');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.dimImagesInDarkMode)).toBe('true');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.pdfReadingMode)).toBe('warm');
  expect(document.documentElement.dataset.dimImagesInDarkMode).toBe('true');
  expect(document.documentElement.dataset.pdfReadingMode).toBe('warm');
});
