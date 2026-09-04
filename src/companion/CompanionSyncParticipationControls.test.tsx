import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionSyncParticipationControls } from './CompanionSyncParticipationControls';

const providerMocks = vi.hoisted(() => ({
  setEnabled: vi.fn()
}));

vi.mock('../shared/platform/companion/sync/syncGroupProvider', () => ({
  setCompanionSyncEnabled: providerMocks.setEnabled
}));

vi.mock('./useCompanionSyncParticipation', () => ({
  useCompanionSyncParticipation: () => ({
    lifecycle_active: true, participating: false, sync_enabled: true, sync_paused: true
  })
}));

beforeEach(() => {
  vi.clearAllMocks();
  providerMocks.setEnabled.mockResolvedValue({
    lifecycle_active: true, participating: false, sync_enabled: false, sync_paused: true
  });
});

it('keeps the global Sync control separate from the local member pause action', async () => {
  renderWithLocalization(<CompanionSyncParticipationControls />);

  const syncSwitch = await screen.findByRole('switch', { name: 'Sync' });
  expect(syncSwitch).toHaveAttribute('aria-checked', 'true');
  fireEvent.click(syncSwitch);

  expect(providerMocks.setEnabled).toHaveBeenCalledWith(false);
  expect(screen.queryByRole('button', { name: 'Resume Sync' })).not.toBeInTheDocument();
});
