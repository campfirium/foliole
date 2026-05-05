import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { listAvailableSystemFonts } from '../model/systemFonts';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

vi.mock('../model/systemFonts', () => ({
  listAvailableSystemFonts: vi.fn()
}));

const mockedListAvailableSystemFonts = vi.mocked(listAvailableSystemFonts);

beforeEach(() => {
  window.localStorage.clear();
  window.electronAPI = undefined;
  mockedListAvailableSystemFonts.mockReset();
  mockedListAvailableSystemFonts.mockResolvedValue({ fonts: [], monospaceFonts: [] });
});

it('stores node list row spacing and removes the override when reset to default', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.change(screen.getByLabelText('Topic list row spacing'), { target: { value: '8' } });

  await waitFor(() => {
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeListRowSpacing)).toBe('8');
  });

  fireEvent.change(screen.getByLabelText('Topic list row spacing'), { target: { value: '6' } });

  await waitFor(() => {
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeListRowSpacing)).toBeNull();
  });
});
