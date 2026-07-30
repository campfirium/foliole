import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const clearCompanionAppData = vi.hoisted(() => vi.fn(async () => undefined));
const reload = vi.hoisted(() => vi.fn());

vi.mock('../shared/platform/companionAppData', () => ({
  clearCompanionAppData
}));

import { COMPANION_CUSTOM_CSS_STORAGE_KEY } from './companionCustomCssStorage';
import { CompanionStorageSettingsContent } from './CompanionStorageSettingsContent';

beforeEach(() => {
  clearCompanionAppData.mockReset();
  clearCompanionAppData.mockResolvedValue(undefined);
  reload.mockClear();
  window.localStorage.setItem(COMPANION_CUSTOM_CSS_STORAGE_KEY, '{"version":1,"snippets":[]}');
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload }
  });
});

it('requires confirmation before clearing app data', async () => {
  render(<CompanionStorageSettingsContent />);

  fireEvent.click(screen.getByRole('button', { name: 'Clear App Data' }));
  expect(clearCompanionAppData).not.toHaveBeenCalled();

  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Clear App Data' }));

  await waitFor(() => expect(clearCompanionAppData).toHaveBeenCalled());
  expect(window.localStorage.getItem(COMPANION_CUSTOM_CSS_STORAGE_KEY)).toBeNull();
  expect(reload).toHaveBeenCalled();
});

it('keeps the custom style cache when clearing app data fails', async () => {
  clearCompanionAppData.mockRejectedValue(new Error('Clear failed'));
  render(<CompanionStorageSettingsContent />);

  fireEvent.click(screen.getByRole('button', { name: 'Clear App Data' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Clear App Data' }));

  expect(await screen.findByText('Clear failed')).toBeInTheDocument();
  expect(window.localStorage.getItem(COMPANION_CUSTOM_CSS_STORAGE_KEY)).not.toBeNull();
  expect(reload).not.toHaveBeenCalled();
});
