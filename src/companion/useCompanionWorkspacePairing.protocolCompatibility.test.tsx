import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import { CompanionPairingHttpError } from '../shared/platform/companionPairingHttpError';

const syncMocks = vi.hoisted(() => ({
  discoverCompanionDesktop: vi.fn(),
  discoverCompanionDesktops: vi.fn(),
  loadCompanionPairingState: vi.fn(),
  pairCompanionWithDesktop: vi.fn(),
  requestCompanionPairing: vi.fn()
}));

vi.mock('../shared/platform/companionWorkspaceSync', () => ({
  discoverCompanionDesktop: syncMocks.discoverCompanionDesktop,
  discoverCompanionDesktops: syncMocks.discoverCompanionDesktops,
  loadCompanionPairingState: syncMocks.loadCompanionPairingState,
  pairCompanionWithDesktop: syncMocks.pairCompanionWithDesktop,
  requestCompanionPairing: syncMocks.requestCompanionPairing
}));

import { useCompanionWorkspacePairing } from './useCompanionWorkspacePairing';

const protocol = {
  capabilities: ['lan-sync-v1'],
  max_supported_version: 1,
  min_supported_version: 1,
  version: 1
};

function createArgs() {
  const bootstrapState: NativeCompanionBootstrapState = {
    booted_at: '2026-04-24T03:00:00.000Z',
    database_path: 'foliole-companionSQLite.db',
    database_ready: true,
    device_id: 'android-test-device',
    device_name: null,
    runtime_kind: 'android-capacitor'
  };
  return { bootstrapState, onError: vi.fn(), onSaveEndpoint: vi.fn(async () => undefined) };
}

beforeEach(() => {
  vi.clearAllMocks();
  syncMocks.loadCompanionPairingState.mockResolvedValue({ is_paired: false });
  syncMocks.discoverCompanionDesktop.mockResolvedValue({
    compatibility: {
      missing_capabilities: [],
      negotiated_version: 1,
      reason: null,
      status: 'compatible'
    },
    discovery: { peer_id: 'desktop-v', protocol },
    endpointUrl: 'http://192.168.1.8:38641'
  });
  syncMocks.requestCompanionPairing.mockResolvedValue({
    expires_at: '2026-04-24T10:02:00.000Z',
    pair_request_id: 'pair-request-1',
    status: 'pending'
  });
});

describe('useCompanionWorkspacePairing protocol compatibility', () => {
  it('stops waiting when pair completion returns protocol_incompatible', async () => {
    syncMocks.pairCompanionWithDesktop.mockRejectedValue(
      new CompanionPairingHttpError(409, 'protocol_incompatible', null)
    );
    const args = createArgs();
    const { result } = renderHook(() => useCompanionWorkspacePairing(args));

    await act(async () => result.current.requestPairing('http://192.168.1.8:38641'));
    await act(async () => {
      await expect(result.current.completePairing()).rejects.toThrow('protocol_incompatible');
    });

    expect(result.current.pairingStatus).toBe('idle');
    expect(result.current.pendingPairRequest).toBeNull();
    expect(args.onError).toHaveBeenLastCalledWith('Update Foliole on both devices, then pair again.');
  });
});
