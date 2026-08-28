import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

const RELEASE_GATE_TEST_TIMEOUT_MS = 15_000;

beforeEach(() => {
  window.localStorage.clear();
  delete window.electronAPI;
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
}, RELEASE_GATE_TEST_TIMEOUT_MS);

it('persists and resets font color from appearance settings', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.change(screen.getByLabelText('Font color picker'), {
    target: { value: '#2d3340' }
  });

  await waitFor(() => {
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.fontColor)).toBe('#2d3340');
    expect(document.documentElement.style.getPropertyValue('--color-foreground')).toBe('45 51 64');
  });

  fireEvent.click(screen.getByLabelText('Reset font color'));

  await waitFor(() => {
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.fontColor)).toBe('#202124');
  });
});

it('stores font color in the active base color mode', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
  fireEvent.change(screen.getByLabelText('Font color picker'), {
    target: { value: '#dde5d8' }
  });

  await waitFor(() => {
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.fontColorDark)).toBe('#dde5d8');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.fontColor)).toBeNull();
  });
});

it('renders a directly clickable native font color input', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));

  expect(screen.getByLabelText('Font color picker')).toHaveClass('cursor-pointer');
});

it('stores appearance colors in the active base color mode', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
  fireEvent.change(screen.getByLabelText('Selection color picker'), {
    target: { value: '#224488' }
  });

  await waitFor(() => {
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.baseColor)).toBe('dark');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.selectionColorDark)).toBe('#224488');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.selectionColor)).toBeNull();
  });

  fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
  fireEvent.change(screen.getByLabelText('Selection color picker'), {
    target: { value: '#336699' }
  });

  await waitFor(() => {
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.selectionColor)).toBe('#336699');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.selectionColorDark)).toBe('#224488');
  });
}, 15_000);

it('uses dark color defaults for appearance color reset controls', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));

  await waitFor(() => {
    expect(screen.getByLabelText('Reset accent color')).toBeDisabled();
    expect(screen.getByLabelText('Reset selection color')).toBeDisabled();
    expect(screen.getByLabelText('Reset highlight color')).toBeDisabled();
    expect(screen.getByLabelText('Reset cloze color')).toBeDisabled();
  });

  fireEvent.change(screen.getByLabelText('Accent color picker'), {
    target: { value: '#88aa99' }
  });
  fireEvent.change(screen.getByLabelText('Selection color picker'), {
    target: { value: '#7799dd' }
  });
  fireEvent.change(screen.getByLabelText('Highlight color picker'), {
    target: { value: '#66bbdd' }
  });
  fireEvent.change(screen.getByLabelText('Cloze color picker'), {
    target: { value: '#ddbb66' }
  });

  await waitFor(() => {
    expect(screen.getByLabelText('Reset accent color')).not.toBeDisabled();
    expect(screen.getByLabelText('Reset selection color')).not.toBeDisabled();
    expect(screen.getByLabelText('Reset highlight color')).not.toBeDisabled();
    expect(screen.getByLabelText('Reset cloze color')).not.toBeDisabled();
  });

  fireEvent.click(screen.getByLabelText('Reset accent color'));
  fireEvent.click(screen.getByLabelText('Reset selection color'));
  fireEvent.click(screen.getByLabelText('Reset highlight color'));
  fireEvent.click(screen.getByLabelText('Reset cloze color'));

  await waitFor(() => {
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.accentColorDark)).toBe('#7fb18d');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.selectionColorDark)).toBe('#78a6ff');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.highlightColorDark)).toBe('#5cc8f3');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.clozeColorDark)).toBe('#e1c15a');
  });
});
