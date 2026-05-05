import { beforeEach, expect, it, vi } from 'vitest';

import {
  approveDesktopCompanionPairRequest,
  clearDesktopCompanionPairedDevices,
  disableDesktopCompanionSync,
  enableDesktopCompanionSync,
  loadDesktopCompanionPairingOverview,
  rejectDesktopCompanionPairRequest
} from './desktopCompanionPairingBridge';

function createMockElectronApi(invoke: ReturnType<typeof vi.fn>) {
  return {
    invoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };
}

beforeEach(() => {
  window.electronAPI = undefined;
});

it('loads desktop companion pairing overview through the native bridge', async () => {
  const invoke = vi.fn().mockResolvedValue({
    pending_requests: [
      {
        device_id: 'android-1',
        device_kind: 'android',
        device_name: 'Pixel 9',
        expires_at: '2026-04-24T10:02:00.000Z',
        pair_request_id: 'pair-request-1',
        requested_at: '2026-04-24T10:00:00.000Z',
        status: 'pending'
      }
    ],
    server_status: {
      advertised_urls: ['http://127.0.0.1:38641'],
      last_error: null,
      paired_device_count: 1,
      pending_pair_request_count: 1,
      port: 38641,
      state: 'running'
    },
    sync_enabled: true
  });
  window.electronAPI = createMockElectronApi(invoke);

  await expect(loadDesktopCompanionPairingOverview()).resolves.toMatchObject({
    pending_requests: [{ device_name: 'Pixel 9', pair_request_id: 'pair-request-1' }],
    server_status: { state: 'running' },
    sync_enabled: true
  });
  expect(invoke).toHaveBeenCalledWith('load_companion_pairing_overview');
});

it('approves and rejects companion pair requests through the native bridge', async () => {
  const invoke = vi.fn().mockResolvedValue({
    pending_requests: [],
    server_status: {
      advertised_urls: ['http://127.0.0.1:38641'],
      last_error: null,
      paired_device_count: 2,
      pending_pair_request_count: 0,
      port: 38641,
      state: 'running'
    },
    sync_enabled: true
  });
  window.electronAPI = createMockElectronApi(invoke);

  await approveDesktopCompanionPairRequest('pair-request-1');
  await rejectDesktopCompanionPairRequest('pair-request-2');

  expect(invoke).toHaveBeenNthCalledWith(1, 'approve_companion_pair_request', {
    pair_request_id: 'pair-request-1'
  });
  expect(invoke).toHaveBeenNthCalledWith(2, 'reject_companion_pair_request', {
    pair_request_id: 'pair-request-2'
  });
});

it('clears paired companion devices through the native bridge', async () => {
  const invoke = vi.fn().mockResolvedValue({
    pending_requests: [],
    server_status: {
      advertised_urls: ['http://127.0.0.1:38641'],
      last_error: null,
      paired_device_count: 0,
      pending_pair_request_count: 0,
      port: 38641,
      state: 'running'
    },
    sync_enabled: true
  });
  window.electronAPI = createMockElectronApi(invoke);

  await clearDesktopCompanionPairedDevices();

  expect(invoke).toHaveBeenCalledWith('clear_companion_paired_devices');
});

it('toggles desktop companion sync through the native bridge', async () => {
  const invoke = vi.fn().mockResolvedValue({
    pending_requests: [],
    server_status: {
      advertised_urls: ['http://127.0.0.1:38641'],
      last_error: null,
      paired_device_count: 0,
      pending_pair_request_count: 0,
      port: 38641,
      state: 'running'
    },
    sync_enabled: true
  });
  window.electronAPI = createMockElectronApi(invoke);

  await enableDesktopCompanionSync();
  await disableDesktopCompanionSync();

  expect(invoke).toHaveBeenNthCalledWith(1, 'enable_companion_sync');
  expect(invoke).toHaveBeenNthCalledWith(2, 'disable_companion_sync');
});
