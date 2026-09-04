import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';

import { createSyncState } from './useCompanionWorkspaceSync.testSupport';

const syncObjectsMock = vi.hoisted(() => ({
  loadCompanionSyncNodeConflicts: vi.fn(async () => [])
}));
const workspaceSyncMock = vi.hoisted(() => ({
  clearCompanionPairingCredentials: vi.fn(),
  loadCompanionReadableArticle: vi.fn<() => Promise<CompanionReadableArticle | null>>(async () => null),
  loadCompanionWorkspaceSyncState: vi.fn(),
  persistCompanionWorkspaceSnapshot: vi.fn(),
  recordCompanionWorkspaceSyncEvent: vi.fn(),
  removeCompanionWorkspaceSyncRememberedTarget: vi.fn(),
  resolveReachableCompanionWorkspaceSyncEndpoint: vi.fn(async (endpointUrl: string) => endpointUrl),
  saveCompanionSyncOnboardingStatus: vi.fn(),
  saveCompanionWorkspaceSyncEndpoint: vi.fn()
}));

vi.mock('../shared/platform/companionSyncObjects', () => syncObjectsMock);
vi.mock('../shared/platform/companionWorkspaceSync', () => workspaceSyncMock);
vi.mock('./useCompanionWorkspaceAutoSync', () => ({ useForegroundAutoSync: vi.fn() }));
vi.mock('./useCompanionWorkspacePairing', () => ({
  useCompanionWorkspacePairing: () => ({
    cancelPairing: vi.fn(),
    checkDesktop: vi.fn(),
    completePairing: vi.fn(),
    desktopDiscoveries: [],
    desktopDiscovery: null,
    pairingState: { is_paired: true },
    pairingStatus: 'idle',
    pendingPairRequest: null,
    refreshPairingState: vi.fn(),
    requestPairing: vi.fn()
  })
}));

function renderReadyHook(useCompanionWorkspaceSync: typeof import('./useCompanionWorkspaceSync').useCompanionWorkspaceSync) {
  return renderHook(() => useCompanionWorkspaceSync({
    booted_at: '2026-04-25T09:00:00.000Z',
    database_path: 'foliole-companionSQLite.db',
    database_ready: true,
    device_id: 'android-test-device',
    runtime_kind: 'android-capacitor'
  }));
}

describe('useCompanionWorkspaceSync ready gate', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    workspaceSyncMock.loadCompanionWorkspaceSyncState.mockResolvedValue(createSyncState(null));
    workspaceSyncMock.loadCompanionReadableArticle.mockResolvedValue(null);
    syncObjectsMock.loadCompanionSyncNodeConflicts.mockResolvedValue([]);
  });

  it('marks local sync state ready after bootstrap state loads', async () => {
    const { useCompanionWorkspaceSync } = await import('./useCompanionWorkspaceSync');
    const { result } = renderReadyHook(useCompanionWorkspaceSync);

    expect(result.current.isWorkspaceSyncStateReady).toBe(false);

    await waitFor(() => expect(result.current.isWorkspaceSyncStateReady).toBe(true));
    expect(result.current.status).toBe('idle');
  });

  it('does not keep the shell loading when bootstrap readable article loading fails', async () => {
    workspaceSyncMock.loadCompanionReadableArticle.mockRejectedValue(new Error('readable failed'));
    const { useCompanionWorkspaceSync } = await import('./useCompanionWorkspaceSync');
    const { result } = renderReadyHook(useCompanionWorkspaceSync);

    await waitFor(() => expect(result.current.isWorkspaceSyncStateReady).toBe(true));
    expect(result.current.status).toBe('idle');
  });

  it('does not keep the shell loading when bootstrap conflict count loading fails', async () => {
    syncObjectsMock.loadCompanionSyncNodeConflicts.mockRejectedValue(new Error('conflicts failed'));
    const { useCompanionWorkspaceSync } = await import('./useCompanionWorkspaceSync');
    const { result } = renderReadyHook(useCompanionWorkspaceSync);

    await waitFor(() => expect(result.current.isWorkspaceSyncStateReady).toBe(true));
    expect(result.current.status).toBe('idle');
  });

  it('enables automatic sync when the group and persistent controls are ready', async () => {
    const { shouldEnableCompanionAutoSync } = await import('./useCompanionWorkspaceSync');
    expect(shouldEnableCompanionAutoSync({
      groupReady: true, syncEnabled: true, syncPaused: false
    })).toBe(true);
    expect(shouldEnableCompanionAutoSync({
      groupReady: false, syncEnabled: true, syncPaused: false
    })).toBe(false);
  });

  it('keeps transient lifecycle inactivity out of the persisted automatic sync controls', async () => {
    const { shouldEnableCompanionAutoSync } = await import('./useCompanionWorkspaceSync');
    expect(shouldEnableCompanionAutoSync({
      groupReady: true, syncEnabled: true, syncPaused: false
    })).toBe(true);
    expect(shouldEnableCompanionAutoSync({
      groupReady: true, syncEnabled: true, syncPaused: true
    })).toBe(false);
    expect(shouldEnableCompanionAutoSync({
      groupReady: true, syncEnabled: false, syncPaused: false
    })).toBe(false);
  });
});
