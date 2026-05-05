import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bridgeMocks = vi.hoisted(() => ({
  loadDesktopCompanionPairingOverview: vi.fn()
}));

vi.mock('./desktopCompanionPairingBridge', () => ({
  approveDesktopCompanionPairRequest: vi.fn(),
  clearDesktopCompanionPairedDevices: vi.fn(),
  disableDesktopCompanionSync: vi.fn(),
  enableDesktopCompanionSync: vi.fn(),
  loadDesktopCompanionPairingOverview: bridgeMocks.loadDesktopCompanionPairingOverview,
  removeDesktopCompanionPairedDevice: vi.fn(),
  rejectDesktopCompanionPairRequest: vi.fn()
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
    bridgeMocks.loadDesktopCompanionPairingOverview.mockResolvedValue(createOverview(0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps polling pairing requests while the desktop document is hidden', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden'
    });
    bridgeMocks.loadDesktopCompanionPairingOverview
      .mockResolvedValueOnce(createOverview(0))
      .mockResolvedValueOnce(createOverview(1));

    const { result } = renderHook(() => useDesktopCompanionPairingRequests(2_000));

    await act(async () => {
      await Promise.resolve();
    });
    expect(bridgeMocks.loadDesktopCompanionPairingOverview).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(bridgeMocks.loadDesktopCompanionPairingOverview).toHaveBeenCalledTimes(2);
    expect(result.current.overview.pending_requests).toHaveLength(1);
  });
});
