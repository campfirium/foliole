import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { preloadTranslationCatalog } from '../../../shared/localization/translations';
import { listAvailableSystemFonts } from '../model/systemFonts';

import { SettingsPanel } from './SettingsPanel';
import { createDeferred, createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

vi.mock('../model/systemFonts', () => ({
  listAvailableSystemFonts: vi.fn()
}));

const mockedListAvailableSystemFonts = vi.mocked(listAvailableSystemFonts);

beforeAll(async () => {
  await preloadTranslationCatalog('en');
});

beforeEach(() => {
  window.localStorage.clear();
  delete window.electronAPI;
  mockedListAvailableSystemFonts.mockReset();
});

it('loads and shares the system font catalog only after a font menu opens', async () => {
  const deferred = createDeferred<{ fonts: string[]; monospaceFonts: string[] }>();
  mockedListAvailableSystemFonts.mockReturnValue(deferred.promise);
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Typography' }));
  expect(mockedListAvailableSystemFonts).not.toHaveBeenCalled();

  const textFont = screen.getByLabelText('Text font');
  const monospaceFont = screen.getByLabelText('Monospace font preset');
  expect(textFont).toBeEnabled();
  expect(monospaceFont).toBeEnabled();

  fireEvent.keyDown(textFont, { code: 'Enter', key: 'Enter' });
  await waitFor(() => expect(mockedListAvailableSystemFonts).toHaveBeenCalledTimes(1));
  expect(screen.getByText('Loading system fonts…')).toBeInTheDocument();
  expect(screen.getByRole('progressbar', { name: 'Loading system fonts…' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Default' })).toHaveClass('bg-foreground/[0.06]');
  expect(screen.getByRole('option', { name: 'Default' })).not.toHaveClass('bg-accent');

  deferred.resolve({ fonts: ['XHei-Believe'], monospaceFonts: ['XHei-Believe-Mono'] });
  const loadedFont = await screen.findByRole('option', { name: 'XHei-Believe' });
  fireEvent.click(loadedFont);
  await waitFor(() => expect(textFont).toHaveTextContent('XHei-Believe'));

  fireEvent.keyDown(monospaceFont, { code: 'Enter', key: 'Enter' });
  expect(mockedListAvailableSystemFonts).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Loading system fonts…')).not.toBeInTheDocument();
});

it('lists the installed Noto family once and keeps system font choices in the existing catalog', async () => {
  mockedListAvailableSystemFonts.mockResolvedValue({ fonts: ['Noto Sans SC', 'Reader System Font'], monospaceFonts: [] });
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="typography" />);
  fireEvent.click(screen.getByRole('combobox', { name: 'Text font' }));
  await screen.findByRole('option', { name: 'Reader System Font' });
  expect(screen.getAllByRole('option', { name: 'Noto Sans SC' })).toHaveLength(1);
  fireEvent.click(screen.getByRole('option', { name: 'Reader System Font' }));
  expect(screen.getByRole('combobox', { name: 'Text font' })).toHaveTextContent('Reader System Font');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.customInterfaceFont)).toBe('Reader System Font');
});

it('preserves an already selected bundled face without adding it to the system font menu', async () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.interfaceFont, 'noto-sans-sc');
  mockedListAvailableSystemFonts.mockResolvedValue({ fonts: ['Reader System Font'], monospaceFonts: [] });
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="typography" />);
  const field = screen.getByRole('combobox', { name: 'Text font' });
  expect(field).toHaveTextContent('Noto Sans SC');
  fireEvent.click(field);
  await screen.findByRole('option', { name: 'Reader System Font' });
  expect(screen.queryByRole('option', { name: 'Noto Sans SC' })).toBeNull();
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.interfaceFont)).toBe('noto-sans-sc');
});
