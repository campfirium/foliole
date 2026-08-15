import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionSyncParticipationControls } from './CompanionSyncParticipationControls';

const providerMocks = vi.hoisted(() => ({
  load: vi.fn(), setEnabled: vi.fn()
}));

vi.mock('../shared/platform/companion/sync/syncGroupProvider', () => ({
  loadCompanionSyncGroupProviderState: providerMocks.load,
  setCompanionSyncEnabled: providerMocks.setEnabled
}));

beforeEach(() => {
  vi.clearAllMocks();
  const paused = { lifecycle_active: true, participating: false, pending_requests: [], port: 38641,
    state: 'paused', sync_enabled: true, sync_paused: true };
  providerMocks.load.mockResolvedValue(paused);
  providerMocks.setEnabled.mockResolvedValue({ ...paused, sync_enabled: false });
});

it('keeps the global Sync control separate from the local member pause action', async () => {
  renderWithLocalization(<CompanionSyncParticipationControls />);

  const syncSwitch = await screen.findByRole('switch', { name: 'Sync' });
  expect(syncSwitch).toHaveAttribute('aria-checked', 'true');
  fireEvent.click(syncSwitch);

  expect(providerMocks.setEnabled).toHaveBeenCalledWith(false);
  expect(screen.queryByRole('button', { name: 'Resume Sync' })).not.toBeInTheDocument();
});
