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
      <button onClick={appearance.toggleEditorDisplayMode} type="button">
        Toggle mode
      </button>
      <button onClick={() => appearance.setMarkdownSyntaxVisibility('visible')} type="button">
        Show syntax
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

  fireEvent.click(screen.getByRole('button', { name: 'Toggle mode' }));
  fireEvent.click(screen.getByRole('button', { name: 'Show syntax' }));

  expect(screen.getByText('preview')).toBeInTheDocument();
  expect(screen.getByText('visible')).toBeInTheDocument();
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.editorDisplayMode)).toBe('preview');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility)).toBe('visible');
});
