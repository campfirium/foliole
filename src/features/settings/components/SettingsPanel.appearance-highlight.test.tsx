import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

beforeEach(() => {
  window.localStorage.clear();
  window.electronAPI = undefined;
});

it('persists and resets selection, highlight, and cloze colors from appearance settings', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.change(screen.getByLabelText('Selection color picker'), {
    target: { value: '#224488' }
  });
  fireEvent.change(screen.getByLabelText('Highlight color picker'), {
    target: { value: '#336699' }
  });
  fireEvent.change(screen.getByLabelText('Cloze color picker'), {
    target: { value: '#ccaa11' }
  });

  await waitFor(() => {
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.selectionColor)).toBe('#224488');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.highlightColor)).toBe('#336699');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.clozeColor)).toBe('#ccaa11');
  });

  fireEvent.click(screen.getByLabelText('Reset selection color'));
  fireEvent.click(screen.getByLabelText('Reset highlight color'));
  fireEvent.click(screen.getByLabelText('Reset cloze color'));

  await waitFor(() => {
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.selectionColor)).toBe('#3876ff');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.highlightColor)).toBe('#38bdf8');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.clozeColor)).toBe('#facc15');
  });
});
