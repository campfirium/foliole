import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';

const compatible = {
  missing_capabilities: [],
  negotiated_version: 1,
  reason: null,
  status: 'compatible' as const
};

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

function createArgs() {
  const bootstrapState: NativeCompanionBootstrapState = {
    booted_at: '2026-04-24T03:00:00.000Z',
    database_path: 'foliole-companionSQLite.db',
    database_ready: true,
    device_id: 'android-test-device',
    device_name: null,
    runtime_kind: 'android-capacitor'
  };
  return {
    bootstrapState,
    onError: vi.fn(),
    onSaveEndpoint: vi.fn(async () => undefined)
  };
}

function desktopDiscovery(hostName = 'V', endpointUrl = 'http://192.168.1.8:38641') {
  return {
    compatibility: compatible,
    discovery: {
      app_version: '0.1.0',
      desktop_device_name: `Foliole Desktop on ${hostName}`,
      desktop_name: 'Foliole Desktop',
      desktop_platform: hostName === 'Studio' ? 'macOS' : 'Windows',
      peer_id: `desktop-${hostName.toLowerCase()}`,
      protocol: {
        capabilities: ['lan-sync-v1'],
        max_supported_version: 1,
        min_supported_version: 1,
        version: 1
      }
    },
    endpointUrl
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('can cancel a pending pair request and keep discovered devices available', async () => {
  syncMocks.loadCompanionPairingState.mockResolvedValue({
    device_id: null,
    device_kind: null,
    device_name: null,
    is_paired: false,
    paired_at: null
  });
  syncMocks.discoverCompanionDesktops.mockResolvedValue([
    desktopDiscovery(),
    desktopDiscovery('Studio', 'http://192.168.1.12:38641')
  ]);
  syncMocks.requestCompanionPairing.mockResolvedValue({
    expires_at: '2026-04-24T10:02:00.000Z',
    pair_request_id: 'pair-request-1',
    status: 'pending'
  });
  const args = createArgs();
  const { result } = renderHook(() => useCompanionWorkspacePairing(args));

  await act(async () => {
    await result.current.checkDesktop('http://10.0.2.2:38641');
  });
  await act(async () => {
    await result.current.requestPairing('http://192.168.1.8:38641');
  });

  expect(syncMocks.discoverCompanionDesktop).not.toHaveBeenCalled();
  expect(args.onSaveEndpoint).not.toHaveBeenCalled();
  expect(result.current.pendingPairRequest?.pairRequestId).toBe('pair-request-1');
  expect(result.current.pairingStatus).toBe('awaiting-approval');
  expect(result.current.desktopDiscoveries).toHaveLength(2);

  act(() => {
    result.current.cancelPairing();
  });

  expect(result.current.pendingPairRequest).toBeNull();
  expect(result.current.pairingStatus).toBe('idle');
  expect(result.current.desktopDiscoveries.map((desktop) => desktop.desktopDeviceName)).toEqual([
    'Foliole Desktop on V',
    'Foliole Desktop on Studio'
  ]);
});
