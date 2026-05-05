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
      <div>{appearance.readingLineHeight}</div>
      <div>{appearance.readingContentWidth}</div>
      <button onClick={appearance.toggleEditorDisplayMode} type="button">
        Toggle mode
      </button>
      <button onClick={() => appearance.setMarkdownSyntaxVisibility('visible')} type="button">
        Show syntax
      </button>
      <button onClick={() => appearance.setPdfReadingMode('warm')} type="button">
        Warm PDF
      </button>
      <button onClick={() => appearance.setReadingLineHeight('relaxed')} type="button">
        Relax line height
      </button>
      <button onClick={() => appearance.setReadingContentWidth(920)} type="button">
        Set reading width
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
  delete document.body.dataset.bootSkeleton;
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
  expect(screen.getByText('standard')).toBeInTheDocument();
  expect(screen.getByText('860')).toBeInTheDocument();
  expect(document.documentElement.dataset.dimImagesInDarkMode).toBe('false');
  expect(document.documentElement.dataset.pdfReadingMode).toBe('inverted');
  expect(document.documentElement.style.getPropertyValue('--content-panel-line-height')).toBe('1.75');
  expect(document.documentElement.style.getPropertyValue('--document-max-width')).toBe('860px');
  expect(document.body.dataset.bootSkeleton).toBeUndefined();

  fireEvent.click(screen.getByRole('button', { name: 'Toggle mode' }));
  fireEvent.click(screen.getByRole('button', { name: 'Show syntax' }));
  fireEvent.click(screen.getByRole('button', { name: 'Warm PDF' }));
  fireEvent.click(screen.getByRole('button', { name: 'Relax line height' }));
  fireEvent.click(screen.getByRole('button', { name: 'Set reading width' }));
  fireEvent.click(screen.getByRole('button', { name: 'Toggle light/dark' }));
  fireEvent.click(screen.getByRole('button', { name: 'Dim images' }));

  expect(screen.getByText('preview')).toBeInTheDocument();
  expect(screen.getByText('visible')).toBeInTheDocument();
  expect(screen.getByText('dark')).toBeInTheDocument();
  expect(screen.getByText('dim-on')).toBeInTheDocument();
  expect(screen.getByText('warm')).toBeInTheDocument();
  expect(screen.getByText('relaxed')).toBeInTheDocument();
  expect(screen.getByText('920')).toBeInTheDocument();
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.editorDisplayMode)).toBe('preview');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility)).toBe('visible');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.baseColor)).toBe('dark');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.dimImagesInDarkMode)).toBe('true');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.pdfReadingMode)).toBe('warm');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.readingLineHeight)).toBe('relaxed');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.readingContentWidth)).toBe('920');
  expect(document.documentElement.dataset.dimImagesInDarkMode).toBe('true');
  expect(document.documentElement.dataset.pdfReadingMode).toBe('warm');
  expect(document.documentElement.style.getPropertyValue('--content-panel-line-height')).toBe('1.9');
  expect(document.documentElement.style.getPropertyValue('--document-max-width')).toBe('920px');
});
