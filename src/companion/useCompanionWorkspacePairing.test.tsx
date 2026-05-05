import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  return {
    bootstrapState: {
      booted_at: '2026-04-24T03:00:00.000Z',
      database_path: 'foliole-companion.db',
      database_ready: true,
      device_id: 'android-test-device',
      runtime_kind: 'android-capacitor' as const
    },
    onError: vi.fn(),
    onSaveEndpoint: vi.fn(async () => undefined)
  };
}

function mockStoredPairingState() {
  syncMocks.loadCompanionPairingState.mockResolvedValue({
    device_id: null,
    device_kind: null,
    device_name: null,
    is_paired: false,
    paired_at: null
  });
}

describe('useCompanionWorkspacePairing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads stored pairing state once on initial render', async () => {
    mockStoredPairingState();
    const args = createArgs();

    const { rerender } = renderHook(() => useCompanionWorkspacePairing(args));
    rerender();
    rerender();

    await waitFor(() => {
      expect(syncMocks.loadCompanionPairingState).toHaveBeenCalledTimes(1);
    });
  });


  it('can cancel a pending pair request and keep discovered devices available', async () => {
    mockStoredPairingState();
    syncMocks.discoverCompanionDesktops.mockResolvedValue([
      {
        discovery: {
          app_version: '0.1.0',
          desktop_device_name: 'Foliole Desktop on V',
          desktop_name: 'Foliole Desktop',
          desktop_platform: 'Windows',
          host_name: 'V',
          peer_id: 'desktop-v'
        },
        endpointUrl: 'http://192.168.1.8:38641'
      },
      {
        discovery: {
          app_version: '0.1.0',
          desktop_device_name: 'Foliole Desktop on Studio',
          desktop_name: 'Foliole Desktop',
          desktop_platform: 'macOS',
          host_name: 'Studio',
          peer_id: 'desktop-studio'
        },
        endpointUrl: 'http://192.168.1.12:38641'
      }
    ]);
    syncMocks.discoverCompanionDesktop.mockResolvedValue({
      discovery: {
        app_version: '0.1.0',
        desktop_device_name: 'Foliole Desktop on V',
        desktop_name: 'Foliole Desktop',
        desktop_platform: 'Windows',
        host_name: 'V',
        peer_id: 'desktop-v'
      },
      endpointUrl: 'http://192.168.1.8:38641'
    });
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

    expect(result.current.pendingPairRequest?.pairRequestId).toBe('pair-request-1');
    expect(result.current.desktopDiscoveries).toHaveLength(2);

    act(() => {
      result.current.cancelPairing();
    });

    expect(result.current.pendingPairRequest).toBeNull();
    expect(result.current.pairingStatus).toBe('idle');
    expect(result.current.desktopDiscoveries.map((desktop) => desktop.hostName)).toEqual(['V', 'Studio']);
  });

  it('clears an expired pending pair request so the user can pair again', async () => {
    mockStoredPairingState();
    syncMocks.discoverCompanionDesktop.mockResolvedValue({
      discovery: {
        app_version: '0.1.0',
        desktop_device_name: 'Foliole Desktop on V',
        desktop_name: 'Foliole Desktop',
        desktop_platform: 'Windows',
        host_name: 'V',
        peer_id: 'desktop-v'
      },
      endpointUrl: 'http://192.168.1.8:38641'
    });
    syncMocks.requestCompanionPairing.mockResolvedValue({
      expires_at: '2026-04-24T10:02:00.000Z',
      pair_request_id: 'pair-request-1',
      status: 'pending'
    });
    syncMocks.pairCompanionWithDesktop.mockRejectedValue(new Error('Desktop pairing failed with 404.'));
    const args = createArgs();

    const { result } = renderHook(() => useCompanionWorkspacePairing(args));

    await act(async () => {
      await result.current.requestPairing('http://192.168.1.8:38641');
    });
    expect(result.current.pendingPairRequest?.pairRequestId).toBe('pair-request-1');

    await act(async () => {
      await expect(result.current.completePairing()).rejects.toThrow('Desktop pairing failed with 404.');
    });

    expect(result.current.pendingPairRequest).toBeNull();
    expect(result.current.pairingStatus).toBe('idle');
    expect(args.onError).toHaveBeenLastCalledWith('Pairing request expired. Tap Pair again.');
  });

  it('uses the native device name when requesting pairing', async () => {
    mockStoredPairingState();
    syncMocks.discoverCompanionDesktop.mockResolvedValue({
      discovery: {
        app_version: '0.1.0',
        desktop_device_name: 'Foliole Desktop on V',
        desktop_name: 'Foliole Desktop',
        desktop_platform: 'Windows',
        host_name: 'V',
        peer_id: 'desktop-v'
      },
      endpointUrl: 'http://192.168.1.8:38641'
    });
    syncMocks.requestCompanionPairing.mockResolvedValue({
      expires_at: '2026-04-24T10:02:00.000Z',
      pair_request_id: 'pair-request-1',
      status: 'pending'
    });
    const args = createArgs();
    args.bootstrapState.device_name = 'Pixel 9';
    const { result } = renderHook(() => useCompanionWorkspacePairing(args));

    await act(async () => {
      await result.current.requestPairing('http://192.168.1.8:38641');
    });

    expect(syncMocks.requestCompanionPairing).toHaveBeenCalledWith(expect.objectContaining({
      deviceName: 'Pixel 9'
    }));
  });

  it('does not send duplicate completion requests while approval is being consumed', async () => {
    mockStoredPairingState();
    syncMocks.discoverCompanionDesktop.mockResolvedValue({
      discovery: {
        app_version: '0.1.0',
        desktop_device_name: 'Foliole Desktop on V',
        desktop_name: 'Foliole Desktop',
        desktop_platform: 'Windows',
        host_name: 'V',
        peer_id: 'desktop-v'
      },
      endpointUrl: 'http://192.168.1.8:38641'
    });
    syncMocks.requestCompanionPairing.mockResolvedValue({
      expires_at: '2026-04-24T10:02:00.000Z',
      pair_request_id: 'pair-request-1',
      status: 'pending'
    });
    syncMocks.pairCompanionWithDesktop.mockImplementation(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 10));
      return {
        device_id: 'android-test-device',
        device_kind: 'android-capacitor',
        device_name: 'Pixel 9',
        is_paired: true,
        paired_at: '2026-04-24T10:03:00.000Z'
      };
    });
    const args = createArgs();
    const { result } = renderHook(() => useCompanionWorkspacePairing(args));

    await act(async () => {
      await result.current.requestPairing('http://192.168.1.8:38641');
    });

    await act(async () => {
      const first = result.current.completePairing();
      const second = result.current.completePairing();
      expect(first).toBe(second);
      await first;
    });

    expect(syncMocks.pairCompanionWithDesktop).toHaveBeenCalledTimes(1);
    expect(result.current.pairingState.is_paired).toBe(true);
  });



  it('ignores stale completion retries after pairing already succeeded', async () => {
    mockStoredPairingState();
    syncMocks.discoverCompanionDesktop.mockResolvedValue({
      discovery: {
        app_version: '0.1.0',
        desktop_device_name: 'Foliole Desktop on V',
        desktop_name: 'Foliole Desktop',
        desktop_platform: 'Windows',
        host_name: 'V',
        peer_id: 'desktop-v'
      },
      endpointUrl: 'http://192.168.1.8:38641'
    });
    syncMocks.requestCompanionPairing.mockResolvedValue({
      expires_at: '2026-04-24T10:02:00.000Z',
      pair_request_id: 'pair-request-1',
      status: 'pending'
    });
    syncMocks.pairCompanionWithDesktop.mockResolvedValueOnce({
      device_id: 'android-test-device',
      device_kind: 'android-capacitor',
      device_name: 'Pixel 9',
      is_paired: true,
      paired_at: '2026-04-24T10:03:00.000Z'
    });
    const args = createArgs();
    const { result } = renderHook(() => useCompanionWorkspacePairing(args));

    await act(async () => {
      await result.current.requestPairing('http://192.168.1.8:38641');
    });
    const staleCompletePairing = result.current.completePairing;

    await act(async () => {
      await staleCompletePairing();
    });
    expect(result.current.pairingState.is_paired).toBe(true);

    await act(async () => {
      await staleCompletePairing();
    });

    expect(syncMocks.pairCompanionWithDesktop).toHaveBeenCalledTimes(1);
    expect(result.current.pendingPairRequest).toBeNull();
    expect(result.current.pairingStatus).toBe('idle');
    expect(result.current.pairingState.is_paired).toBe(true);
    expect(args.onError).toHaveBeenLastCalledWith(null);
  });

  it('keeps the paired state when a stale initial load resolves after pairing', async () => {
    let resolveStoredPairingState: (value: unknown) => void = () => undefined;
    syncMocks.loadCompanionPairingState.mockReturnValue(new Promise((resolve) => {
      resolveStoredPairingState = resolve;
    }));
    syncMocks.discoverCompanionDesktop.mockResolvedValue({
      discovery: {
        app_version: '0.1.0',
        desktop_device_name: 'Foliole Desktop on V',
        desktop_name: 'Foliole Desktop',
        desktop_platform: 'Windows',
        host_name: 'V',
        peer_id: 'desktop-v'
      },
      endpointUrl: 'http://192.168.1.8:38641'
    });
    syncMocks.requestCompanionPairing.mockResolvedValue({
      expires_at: '2026-04-24T10:02:00.000Z',
      pair_request_id: 'pair-request-1',
      status: 'pending'
    });
    syncMocks.pairCompanionWithDesktop.mockResolvedValue({
      device_id: 'android-test-device',
      device_kind: 'android-capacitor',
      device_name: 'Pixel 9',
      is_paired: true,
      paired_at: '2026-04-24T10:03:00.000Z'
    });
    const args = createArgs();
    const { result } = renderHook(() => useCompanionWorkspacePairing(args));

    await act(async () => {
      await result.current.requestPairing('http://192.168.1.8:38641');
    });
    expect(result.current.pendingPairRequest?.pairRequestId).toBe('pair-request-1');

    await act(async () => {
      await result.current.completePairing();
    });
    expect(result.current.pairingState.is_paired).toBe(true);

    await act(async () => {
      resolveStoredPairingState({
        device_id: null,
        device_kind: null,
        device_name: null,
        is_paired: false,
        paired_at: null
      });
      await Promise.resolve();
    });

    expect(result.current.pairingState.is_paired).toBe(true);
  });

});
