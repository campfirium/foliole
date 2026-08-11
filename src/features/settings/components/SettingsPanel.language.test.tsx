import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

beforeEach(() => {
  window.localStorage.clear();
  delete window.electronAPI;
});

it('offers System and every formal locale, switches immediately, and persists the choice', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="general" />);

  expect(await screen.findByRole('heading', { level: 2, name: 'General' })).toBeInTheDocument();
  const select = screen.getByRole('combobox', { name: 'App language' });
  expect(screen.getAllByRole('option').filter((option) => option.closest('select') === select)).toHaveLength(13);
  expect(screen.getByRole('option', { name: 'Português (Brasil)' })).toHaveValue('pt-BR');

  fireEvent.change(select, { target: { value: 'de' } });
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'App-Sprache' })).toHaveValue('de'));
  expect(window.localStorage.getItem('foliole-app-language')).toBe('de');

  fireEvent.change(screen.getByRole('combobox', { name: 'App-Sprache' }), { target: { value: 'system' } });
  await waitFor(() => expect(window.localStorage.getItem('foliole-app-language')).toBe('system'));
});
