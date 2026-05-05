import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

beforeEach(() => {
  window.localStorage.clear();
  window.electronAPI = undefined;
});

it('edits the highlight annotation prefix from editor settings', () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="editor" />);

  const input = screen.getByLabelText('Highlight annotation prefix');
  expect(input).toHaveValue('※ ');

  fireEvent.change(input, { target: { value: 'Note: ' } });

  expect(input).toHaveValue('Note: ');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.highlightAnnotationPrefix)).toBe('Note: ');

  fireEvent.click(screen.getByRole('button', { name: 'Reset highlight annotation prefix' }));

  expect(input).toHaveValue('※ ');
});
