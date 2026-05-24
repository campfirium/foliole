import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { listAvailableSystemFonts } from '../model/systemFonts';

import { SettingsPanel } from './SettingsPanel';
import {
  createProps,
  openReviewSettings,
  renderWithMouseGestureProvider
} from './SettingsPanel.testUtils';

vi.mock('../model/systemFonts', () => ({
  listAvailableSystemFonts: vi.fn()
}));

beforeEach(() => {
  window.localStorage.clear();
  delete window.electronAPI;
  vi.mocked(listAvailableSystemFonts).mockReset();
  vi.mocked(listAvailableSystemFonts).mockResolvedValue({ fonts: [], monospaceFonts: [] });
});

it('lets the user choose when a new day starts', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  openReviewSettings();

  expect(screen.getByRole('heading', { level: 4, name: 'New day starts at' })).toBeInTheDocument();
  expect(screen.getByText('Cards due on a day become available from this local time.')).toBeInTheDocument();
  expect(screen.getByLabelText('New day starts at')).toHaveValue('4');

  fireEvent.change(screen.getByLabelText('New day starts at'), {
    target: { value: '6' }
  });

  await waitFor(() => {
    expect(screen.getByLabelText('New day starts at')).toHaveValue('6');
  });
});
