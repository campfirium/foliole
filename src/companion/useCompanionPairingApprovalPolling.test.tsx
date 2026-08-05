import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { useCompanionPairingApprovalPolling } from './useCompanionPairingApprovalPolling';

afterEach(() => vi.useRealTimers());

it('does not restart approval polling when action identities change during a render', async () => {
  vi.useFakeTimers();
  const firstCompletePairing = vi.fn(async () => undefined);
  const state = {
    completePairing: firstCompletePairing,
    pairingStatus: 'awaiting-approval' as const,
    pendingPairRequest: {
      endpointUrl: 'http://192.168.1.8:38641',
      expiresAt: '2026-04-24T10:02:00.000Z',
      pairRequestId: 'pair-request-1',
      remotePeerId: 'device-desktop',
      remotePeerName: 'Desktop',
      remotePeerPlatform: 'macOS'
    },
    pullFromDesktop: vi.fn(async () => undefined)
  };
  const { rerender } = renderHook(() => useCompanionPairingApprovalPolling(state, 7_000));
  await act(async () => Promise.resolve());
  const nextCompletePairing = vi.fn(async () => undefined);
  state.completePairing = nextCompletePairing;
  rerender();
  await act(async () => Promise.resolve());

  expect(firstCompletePairing).toHaveBeenCalledTimes(1);
  expect(nextCompletePairing).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(nextCompletePairing).toHaveBeenCalledTimes(8);
});
