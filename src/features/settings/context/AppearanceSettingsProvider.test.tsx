import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import { AppearanceSettingsProvider, useAppearanceSettings } from './AppearanceSettingsProvider';

function AppearanceHarness() {
  const appearance = useAppearanceSettings();

  return (
    <>
      <div>{appearance.editorDisplayMode}</div>
      <div>{appearance.frontmatterDisplayMode}</div>
      <div>{appearance.frontmatterMetaFields}</div>
      <div>{appearance.markdownSyntaxVisibility}</div>
      <div>{appearance.baseColorMode}</div>
      <div>{appearance.dimImagesInDarkMode ? 'dim-on' : 'dim-off'}</div>
      <div>{appearance.pdfReadingMode}</div>
      <div>{appearance.readingLineHeight}</div>
      <div>{appearance.readingParagraphSpacing}</div>
      <div>{appearance.readingContentWidth}</div>
      <div>{appearance.selectionToolbarOpacityPercent}</div>
      <div>{appearance.workspaceDividerOpacityPercent}</div>
      <button onClick={appearance.toggleEditorDisplayMode} type="button">
        Toggle mode
      </button>
      <button onClick={() => appearance.setFrontmatterDisplayMode('full')} type="button">
        Full frontmatter
      </button>
      <button onClick={() => appearance.setFrontmatterMetaFields('aliases, source')} type="button">
        Set frontmatter meta
      </button>
      <button onClick={appearance.resetFrontmatterMetaFields} type="button">
        Reset frontmatter meta
      </button>
      <button onClick={() => appearance.setPdfReadingMode('warm')} type="button">
        Warm PDF
      </button>
      <button onClick={() => appearance.setReadingLineHeight(1.85)} type="button">
        Relax line height
      </button>
      <button onClick={() => appearance.setReadingParagraphSpacing(1.25)} type="button">
        Set paragraph spacing
      </button>
      <button onClick={() => appearance.setReadingContentWidth(920)} type="button">
        Set reading width
      </button>
      <button onClick={() => appearance.setSelectionToolbarOpacityPercent(42)} type="button">
        Set toolbar opacity
      </button>
      <button onClick={() => appearance.setWorkspaceDividerOpacityPercent(18)} type="button">
        Set divider opacity
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

function expectToolbarOpacity(value: string) {
  expect(document.documentElement.style.getPropertyValue('--app-selection-toolbar-opacity')).toBe(value);
}

function expectDividerOpacity(value: string) {
  expect(document.documentElement.style.getPropertyValue('--workspace-divider-opacity')).toBe(value);
}

function applyAppearanceHarnessUpdates() {
  fireEvent.click(screen.getByRole('button', { name: 'Toggle mode' }));
  fireEvent.click(screen.getByRole('button', { name: 'Full frontmatter' }));
  fireEvent.click(screen.getByRole('button', { name: 'Set frontmatter meta' }));
  fireEvent.click(screen.getByRole('button', { name: 'Warm PDF' }));
  fireEvent.click(screen.getByRole('button', { name: 'Relax line height' }));
  fireEvent.click(screen.getByRole('button', { name: 'Set paragraph spacing' }));
  fireEvent.click(screen.getByRole('button', { name: 'Set reading width' }));
  fireEvent.click(screen.getByRole('button', { name: 'Set toolbar opacity' }));
  fireEvent.click(screen.getByRole('button', { name: 'Set divider opacity' }));
  fireEvent.click(screen.getByRole('button', { name: 'Toggle light/dark' }));
  fireEvent.click(screen.getByRole('button', { name: 'Dim images' }));
}

function expectInitialAppliedAppearance() {
  expect(document.documentElement.dataset.dimImagesInDarkMode).toBe('true');
  expect(document.documentElement.dataset.pdfReadingMode).toBe('original');
  expect(document.documentElement.style.getPropertyValue('--content-panel-line-height')).toBe('1.75');
  expect(document.documentElement.style.getPropertyValue('--content-panel-paragraph-spacing')).toBe('0.75em');
  expect(document.documentElement.style.getPropertyValue('--app-interface-font-family')).toBe('var(--font-family-interface)');
  expect(document.documentElement.style.getPropertyValue('--content-panel-font-family')).toBe('var(--font-family-text)');
  expect(document.documentElement.style.getPropertyValue('--document-max-width')).toBe('860px');
  expectToolbarOpacity('1');
  expectDividerOpacity('1');
}

it('hydrates saved appearance settings and persists updates through the shared provider', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.editorDisplayMode, 'source');

  render(
    <AppearanceSettingsProvider>
      <AppearanceHarness />
    </AppearanceSettingsProvider>
  );

  expect(screen.getByText('source')).toBeInTheDocument();
  expect(screen.getByText('compact')).toBeInTheDocument();
  expect(screen.getByText('author|byline, url|link|source|source_url')).toBeInTheDocument();
  expect(screen.getByText('hidden')).toBeInTheDocument();
  expect(screen.getByText('light')).toBeInTheDocument();
  expect(screen.getByText('dim-on')).toBeInTheDocument();
  expect(screen.getByText('warm')).toBeInTheDocument();
  expect(screen.getByText('1.75')).toBeInTheDocument();
  expect(screen.getByText('0.75')).toBeInTheDocument();
  expect(screen.getByText('860')).toBeInTheDocument();
  expectInitialAppliedAppearance();
  expect(document.body.dataset.bootSkeleton).toBeUndefined();

  applyAppearanceHarnessUpdates();

  expect(screen.getByText('preview')).toBeInTheDocument();
  expect(screen.getByText('full')).toBeInTheDocument();
  expect(screen.getByText('aliases, source')).toBeInTheDocument();
  expect(screen.getByText('hidden')).toBeInTheDocument();
  expect(screen.getByText('dark')).toBeInTheDocument();
  expect(screen.getByText('dim-on')).toBeInTheDocument();
  expect(screen.getByText('warm')).toBeInTheDocument();
  expect(screen.getByText('1.85')).toBeInTheDocument();
  expect(screen.getByText('1.25')).toBeInTheDocument();
  expect(screen.getByText('920')).toBeInTheDocument();
  expect(screen.getByText('42')).toBeInTheDocument();
  expect(screen.getByText('18')).toBeInTheDocument();
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.editorDisplayMode)).toBe('preview');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.frontmatterDisplayMode)).toBe('full');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.frontmatterMetaFields)).toBe('aliases, source');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility)).toBeNull();
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.baseColor)).toBe('dark');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.dimImagesInDarkMode)).toBe('true');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.pdfReadingMode)).toBe('warm');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.readingLineHeight)).toBe('1.85');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.readingParagraphSpacing)).toBe('1.25');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.readingContentWidth)).toBe('920');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.selectionToolbarOpacityPercent)).toBe('42');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceDividerOpacityPercent)).toBe('18');
  expect(document.documentElement.dataset.dimImagesInDarkMode).toBe('true');
  expect(document.documentElement.dataset.pdfReadingMode).toBe('warm');
  expect(document.documentElement.style.getPropertyValue('--content-panel-line-height')).toBe('1.85');
  expect(document.documentElement.style.getPropertyValue('--content-panel-paragraph-spacing')).toBe('1.25em');
  expect(document.documentElement.style.getPropertyValue('--document-max-width')).toBe('920px');
  expectToolbarOpacity('0.42');
  expectDividerOpacity('0.18');

  fireEvent.click(screen.getByRole('button', { name: 'Reset frontmatter meta' }));
  expect(screen.getByText('author|byline, url|link|source|source_url')).toBeInTheDocument();
});

it('keeps light mode PDFs original while preserving the dark mode PDF preference', () => {
  render(
    <AppearanceSettingsProvider>
      <AppearanceHarness />
    </AppearanceSettingsProvider>
  );

  fireEvent.click(screen.getByRole('button', { name: 'Warm PDF' }));

  expect(screen.getByText('warm')).toBeInTheDocument();
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.pdfReadingMode)).toBe('warm');
  expect(document.documentElement.dataset.pdfReadingMode).toBe('original');

  fireEvent.click(screen.getByRole('button', { name: 'Toggle light/dark' }));
  expect(screen.getByText('dark')).toBeInTheDocument();
  expect(document.documentElement.dataset.pdfReadingMode).toBe('warm');
});

it('keeps the selected reading line height when the color mode changes', () => {
  render(
    <AppearanceSettingsProvider>
      <AppearanceHarness />
    </AppearanceSettingsProvider>
  );

  fireEvent.click(screen.getByRole('button', { name: 'Relax line height' }));
  expect(document.documentElement.style.getPropertyValue('--content-panel-line-height')).toBe('1.85');

  fireEvent.click(screen.getByRole('button', { name: 'Toggle light/dark' }));
  expect(screen.getByText('dark')).toBeInTheDocument();
  expect(document.documentElement.style.getPropertyValue('--content-panel-line-height')).toBe('1.85');
});

it('applies the same reading line height values after the color mode changes first', () => {
  render(
    <AppearanceSettingsProvider>
      <AppearanceHarness />
    </AppearanceSettingsProvider>
  );

  fireEvent.click(screen.getByRole('button', { name: 'Toggle light/dark' }));
  expect(screen.getByText('dark')).toBeInTheDocument();
  expect(document.documentElement.style.getPropertyValue('--content-panel-line-height')).toBe('1.75');

  fireEvent.click(screen.getByRole('button', { name: 'Relax line height' }));
  expect(document.documentElement.style.getPropertyValue('--content-panel-line-height')).toBe('1.85');
});
