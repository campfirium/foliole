import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeRepositoryMocks = vi.hoisted(() => ({
  loadDesktopCompanionPairingOverview: vi.fn(),
  onDesktopCompanionPairingRequestsChanged: vi.fn(),
  onDesktopSyncGroupDiscoveryChanged: vi.fn(),
  stopDiscoveringDesktopSyncGroups: vi.fn()
}));

vi.mock('./desktopCompanionPairingRuntimeRepository', () => ({
  approveDesktopCompanionPairRequest: vi.fn(),
  clearDesktopCompanionPairedDevices: vi.fn(),
  disableDesktopCompanionSync: vi.fn(),
  enableDesktopCompanionSync: vi.fn(),
  loadDesktopCompanionPairingOverview: runtimeRepositoryMocks.loadDesktopCompanionPairingOverview,
  onDesktopCompanionPairingRequestsChanged: runtimeRepositoryMocks.onDesktopCompanionPairingRequestsChanged,
  onDesktopSyncGroupDiscoveryChanged: runtimeRepositoryMocks.onDesktopSyncGroupDiscoveryChanged,
  removeDesktopCompanionPairedDevice: vi.fn(),
  rejectDesktopCompanionPairRequest: vi.fn(),
  stopDiscoveringDesktopSyncGroups: runtimeRepositoryMocks.stopDiscoveringDesktopSyncGroups
}));

vi.mock('./runtime', () => ({
  isDesktopRuntime: () => true
}));

import { useDesktopCompanionPairingRequests } from './useDesktopCompanionPairingRequests';

function createOverview(pendingRequestCount: number) {
  return {
    paired_devices: [],
    pending_requests: pendingRequestCount > 0
      ? [
          {
            client_address: '192.168.1.22',
            device_id: 'android-1',
            device_kind: 'android-capacitor',
            device_name: 'Android companion android-1',
            expires_at: '2026-04-24T10:02:00.000Z',
            pair_request_id: 'pair-request-1',
            requested_at: '2026-04-24T10:00:00.000Z',
            status: 'pending' as const
          }
        ]
      : [],
    server_status: {
      advertised_urls: ['http://127.0.0.1:38641'],
      last_error: null,
      paired_device_count: 0,
      pending_pair_request_count: pendingRequestCount,
      port: 38641,
      state: 'running' as const
    },
    sync_enabled: true
  };
}

describe('useDesktopCompanionPairingRequests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    runtimeRepositoryMocks.loadDesktopCompanionPairingOverview.mockResolvedValue(createOverview(0));
    runtimeRepositoryMocks.onDesktopCompanionPairingRequestsChanged.mockReturnValue(() => undefined);
    runtimeRepositoryMocks.onDesktopSyncGroupDiscoveryChanged.mockReturnValue(() => undefined);
    runtimeRepositoryMocks.stopDiscoveringDesktopSyncGroups.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps polling pairing requests while the desktop document is hidden', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden'
    });
    runtimeRepositoryMocks.loadDesktopCompanionPairingOverview
      .mockResolvedValueOnce(createOverview(0))
      .mockResolvedValueOnce(createOverview(1));

    const { result } = renderHook(() => useDesktopCompanionPairingRequests(2_000));

    await act(async () => {
      await Promise.resolve();
    });
    expect(runtimeRepositoryMocks.loadDesktopCompanionPairingOverview).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(runtimeRepositoryMocks.loadDesktopCompanionPairingOverview).toHaveBeenCalledTimes(2);
    expect(result.current.overview.pending_requests).toHaveLength(1);
  });

  it('refreshes immediately when native pairing requests change', async () => {
    let listener: (() => void) | null = null;
    runtimeRepositoryMocks.onDesktopCompanionPairingRequestsChanged.mockImplementation((nextListener: () => void) => {
      listener = nextListener;
      return () => {
        listener = null;
      };
    });
    runtimeRepositoryMocks.loadDesktopCompanionPairingOverview
      .mockResolvedValueOnce(createOverview(0))
      .mockResolvedValueOnce(createOverview(1));

    const { result } = renderHook(() => useDesktopCompanionPairingRequests(2_000));

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.overview.pending_requests).toHaveLength(0);

    await act(async () => {
      listener?.();
      await Promise.resolve();
    });

    expect(runtimeRepositoryMocks.loadDesktopCompanionPairingOverview).toHaveBeenCalledTimes(2);
    expect(result.current.overview.pending_requests).toHaveLength(1);
  });
});
