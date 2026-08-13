import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionSyncParticipationControls } from './CompanionSyncParticipationControls';

const providerMocks = vi.hoisted(() => ({
  load: vi.fn(), setEnabled: vi.fn(), setPaused: vi.fn()
}));

vi.mock('../shared/platform/companion/sync/syncGroupProvider', () => ({
  loadCompanionSyncGroupProviderState: providerMocks.load,
  setCompanionSyncEnabled: providerMocks.setEnabled,
  setCompanionSyncPaused: providerMocks.setPaused
}));

beforeEach(() => {
  vi.clearAllMocks();
  const paused = { lifecycle_active: true, participating: false, pending_requests: [], port: 38641,
    state: 'paused', sync_enabled: true, sync_paused: true };
  providerMocks.load.mockResolvedValue(paused);
  providerMocks.setEnabled.mockResolvedValue({ ...paused, sync_enabled: false });
  providerMocks.setPaused.mockResolvedValue({ ...paused, participating: true, sync_paused: false });
});

it('offers Sync and Resume without requiring Sync Group membership', async () => {
  renderWithLocalization(<CompanionSyncParticipationControls />);

  fireEvent.click(await screen.findByRole('button', { name: 'Turn Off' }));
  fireEvent.click(screen.getByRole('button', { name: 'Resume Sync' }));

  expect(providerMocks.setEnabled).toHaveBeenCalledWith(false);
  expect(providerMocks.setPaused).toHaveBeenCalledWith(false);
});
