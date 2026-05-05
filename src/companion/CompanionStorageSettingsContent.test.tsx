import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const clearCompanionAppData = vi.hoisted(() => vi.fn(async () => undefined));
const reload = vi.hoisted(() => vi.fn());

vi.mock('../shared/platform/companionAppData', () => ({
  clearCompanionAppData
}));

import { CompanionStorageSettingsContent } from './CompanionStorageSettingsContent';

beforeEach(() => {
  clearCompanionAppData.mockClear();
  reload.mockClear();
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
  expect(reload).toHaveBeenCalled();
});
