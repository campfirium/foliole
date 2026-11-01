import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeInvoke } from '../../../../lib/platform/nativeContract';
import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

vi.mock('../model/systemFonts', () => ({ listAvailableSystemFonts: vi.fn(async () => ({ fonts: [], monospaceFonts: [] })) }));
const load = vi.fn();
beforeEach(() => {
  window.localStorage.clear();
  load.mockReset().mockResolvedValue([{}]);
  Object.defineProperty(document, 'fonts', { configurable: true, value: { load } });
  window.electronAPI = { invoke: vi.fn(async () => null) as NativeInvoke } as NonNullable<typeof window.electronAPI>;
});

it('allows fine weight only for the verified reading font and preserves its preference across font changes', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="typography" />);
  expect(screen.getByRole('spinbutton', { name: 'Font weight' })).toBeDisabled();
  fireEvent.click(screen.getByRole('combobox', { name: 'Text font' }));
  fireEvent.click(screen.getByRole('option', { name: 'Noto Sans SC' }));
  const field = screen.getByRole('spinbutton', { name: 'Font weight' });
  await waitFor(() => expect(field).toBeEnabled());
  fireEvent.change(field, { target: { value: '435' } });
  fireEvent.blur(field);
  await waitFor(() => expect(document.documentElement.style.getPropertyValue('--content-panel-font-weight')).toBe('435'));
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.readingFontWeight)).toBe('435');
  fireEvent.click(screen.getByRole('combobox', { name: 'Text font' }));
  fireEvent.click(screen.getByRole('option', { name: 'Default' }));
  expect(field).toBeDisabled();
  expect(document.documentElement.style.getPropertyValue('--content-panel-font-weight')).toBe('400');
  fireEvent.click(screen.getByRole('combobox', { name: 'Text font' }));
  fireEvent.click(screen.getByRole('option', { name: 'Noto Sans SC' }));
  await waitFor(() => expect(field).toBeEnabled());
  expect(field).toHaveValue(435);
  fireEvent.click(screen.getByRole('button', { name: 'Reset font weight' }));
  await waitFor(() => expect(field).toHaveValue(400));
});

it('leaves an empty numeric draft unapplied and permits retry after a font load failure', async () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.interfaceFont, 'noto-sans-sc');
  load.mockRejectedValueOnce(new Error('font unavailable'));
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="typography" />);
  await screen.findByText('Could not load Noto Sans SC.');
  expect(screen.getByRole('spinbutton', { name: 'Font weight' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  const field = screen.getByRole('spinbutton', { name: 'Font weight' });
  await waitFor(() => expect(field).toBeEnabled());
  fireEvent.change(field, { target: { value: '' } });
  fireEvent.blur(field);
  expect(field).toHaveValue(400);
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.readingFontWeight)).toBeNull();
});
