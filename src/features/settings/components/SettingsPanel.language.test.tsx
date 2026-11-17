import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { APP_LANGUAGE_PREFERENCES } from '../../../shared/localization/appLanguage';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

vi.mock('../../../shared/platform/desktop/searchAliasFile', () => ({
  loadSearchAliasFileStatus: async () => ({ error: null })
}));

beforeEach(() => {
  window.localStorage.clear();
  delete window.electronAPI;
});

it('offers System and every formal locale, switches immediately, and persists the choice', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="general" />);

  expect(await screen.findByRole('heading', { level: 2, name: 'General' })).toBeInTheDocument();
  const select = screen.getByRole('combobox', { name: 'App language' });
  expect(within(select).getAllByRole<HTMLOptionElement>('option').map(option => option.value).sort())
    .toEqual([...APP_LANGUAGE_PREFERENCES].sort());
  expect(screen.getByRole('option', { name: 'Português (Brasil)' })).toHaveValue('pt-BR');

  fireEvent.change(select, { target: { value: 'de' } });
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'App-Sprache' })).toHaveValue('de'));
  expect(window.localStorage.getItem('foliole-app-language')).toBe('de');

  fireEvent.change(screen.getByRole('combobox', { name: 'App-Sprache' }), { target: { value: 'system' } });
  await waitFor(() => expect(window.localStorage.getItem('foliole-app-language')).toBe('system'));
});
