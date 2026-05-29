import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NativeCompanionPairingState } from '../../lib/platform/nativeCompanionSyncContract';

const platformMock = vi.hoisted(() => ({
  clearCompanionPairingCredentials: vi.fn(),
  loadCompanionReadableArticle: vi.fn(async () => null),
  loadCompanionWorkspaceSyncState: vi.fn(),
  saveCompanionWorkspaceSyncEndpoint: vi.fn()
}));

const pairingMock = vi.hoisted(() => ({
  refreshPairingState: vi.fn<() => Promise<NativeCompanionPairingState>>()
}));

vi.mock('../shared/platform/companionSyncObjects', () => ({
  loadCompanionSyncNodeConflicts: vi.fn(async () => [])
}));

vi.mock('../shared/platform/companionWorkspaceSync', () => ({
  clearCompanionPairingCredentials: platformMock.clearCompanionPairingCredentials,
  loadCompanionReadableArticle: platformMock.loadCompanionReadableArticle,
  loadCompanionWorkspaceSyncState: platformMock.loadCompanionWorkspaceSyncState,
  saveCompanionWorkspaceSyncEndpoint: platformMock.saveCompanionWorkspaceSyncEndpoint
}));

vi.mock('./useCompanionWorkspaceAutoSync', () => ({
  useForegroundAutoSync: vi.fn()
}));

vi.mock('./useCompanionWorkspacePairing', () => ({
  useCompanionWorkspacePairing: () => ({
    cancelPairing: vi.fn(),
    checkDesktop: vi.fn(),
    completePairing: vi.fn(),
    desktopDiscoveries: [],
    desktopDiscovery: null,
    pairingState: {
      device_id: 'android-test-device',
      device_kind: 'android-capacitor',
      device_name: 'Android companion',
      is_paired: true,
      paired_at: '2026-04-25T09:00:00.000Z',
      primary_device_id: 'device-desktop'
    },
    pairingStatus: 'idle',
    pendingPairRequest: null,
    refreshPairingState: pairingMock.refreshPairingState,
    requestPairing: vi.fn()
  })
}));

function syncState() {
  return {
    endpoint_url: 'http://10.0.2.2:38641',
    last_synced_at: '2026-04-22T12:00:00.000Z',
    remembered_targets: ['http://10.0.2.2:38641'],
    sync_events: [],
    sync_onboarding_status: 'completed' as const,
    workspace_snapshot: null
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  platformMock.loadCompanionWorkspaceSyncState.mockResolvedValue(syncState());
  platformMock.saveCompanionWorkspaceSyncEndpoint.mockResolvedValue({ ...syncState(), endpoint_url: null });
  pairingMock.refreshPairingState.mockResolvedValue({
    device_id: null,
    device_kind: null,
    device_name: null,
    is_paired: false,
    paired_at: null,
    primary_device_id: null
  });
});

describe('useCompanionWorkspaceSync disconnect', () => {
  it('clears pairing credentials and the active sync endpoint', async () => {
    const { useCompanionWorkspaceSync } = await import('./useCompanionWorkspaceSync');
    const { result } = renderHook(() => useCompanionWorkspaceSync({
      booted_at: '2026-04-25T09:00:00.000Z',
      database_path: 'foliole-companionSQLite.db',
      database_ready: true,
      device_id: 'android-test-device',
      runtime_kind: 'android-capacitor'
    }));

    await waitFor(() => expect(result.current.status).toBe('idle'));
    await act(async () => {
      await result.current.disconnectPairing();
    });

    expect(platformMock.clearCompanionPairingCredentials).toHaveBeenCalledTimes(1);
    expect(pairingMock.refreshPairingState).toHaveBeenCalledTimes(1);
    expect(platformMock.saveCompanionWorkspaceSyncEndpoint).toHaveBeenCalledWith('');
  });
});
