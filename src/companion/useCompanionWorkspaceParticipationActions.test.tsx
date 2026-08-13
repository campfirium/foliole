import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('./useCompanionSyncParticipation', () => ({
  assertCompanionSyncParticipating: (participating: boolean) => {
    if (!participating) throw new Error('sync_participation_inactive');
  },
  useCompanionSyncParticipation: () => ({
    lifecycle_active: true, participating: false, sync_enabled: true, sync_paused: true
  })
}));

import { useCompanionWorkspaceParticipationActions } from './useCompanionWorkspaceParticipationActions';

it('blocks manual sync and joining while local participation is inactive', async () => {
  const pairing = {
    checkDesktop: vi.fn(), completePairing: vi.fn(), refreshPairingState: vi.fn(), requestPairing: vi.fn()
  };
  const setError = vi.fn();
  const snapshotActions = { pullFromDesktop: vi.fn() };
  const { result } = renderHook(() => useCompanionWorkspaceParticipationActions({
    pairing: pairing as never, setError, snapshotActions: snapshotActions as never
  }));

  await act(async () => {
    await expect(result.current.pullFromDesktop('http://desktop')).rejects
      .toThrow('sync_participation_inactive');
  });
  expect(snapshotActions.pullFromDesktop).not.toHaveBeenCalled();
  expect(pairing.refreshPairingState).not.toHaveBeenCalled();
  expect(setError).toHaveBeenCalledWith('sync_participation_inactive');
});
