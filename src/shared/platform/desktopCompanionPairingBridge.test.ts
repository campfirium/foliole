import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeInvoke } from '../../../lib/platform/nativeContract';

import {
  approveDesktopCompanionPairRequest,
  clearDesktopCompanionPairedDevices,
  disableDesktopCompanionSync,
  enableDesktopCompanionSync,
  loadDesktopCompanionPairingOverview,
  removeDesktopCompanionPairedDevice,
  rejectDesktopCompanionPairRequest,
  setDesktopAsPrimaryDevice
} from './desktopCompanionPairingBridge';

function createMockElectronApi(invoke: NativeInvoke) {
  return {
    invoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };
}

beforeEach(() => {
  delete window.electronAPI;
});

it('loads desktop companion pairing overview through the native bridge', async () => {
  const invoke = vi.fn().mockResolvedValue({
    paired_devices: [
      {
        client_address: '192.168.1.22',
        device_id: 'android-1',
        device_kind: 'android-capacitor',
        device_name: 'Android companion android-1',
        paired_at: '2026-04-24T10:03:00.000Z'
      }
    ],
    pending_requests: [
      {
        client_address: '192.168.1.22',
        device_id: 'android-1',
        device_kind: 'android',
        device_name: 'Pixel 9',
        expires_at: '2026-04-24T10:02:00.000Z',
        pair_request_id: 'pair-request-1',
        requested_at: '2026-04-24T10:00:00.000Z',
        status: 'pending'
      }
    ],
    primary_device_state: {
      can_initiate_takeover: false,
      local_role: 'primary',
      primary_device_id: 'device-desktop',
      source: 'desktop-paired-default',
      takeover_blocked_reasons: []
    },
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
    paired_devices: [{ client_address: '192.168.1.22', device_id: 'android-1', device_kind: 'android-capacitor' }],
    pending_requests: [{ client_address: '192.168.1.22', device_name: 'Pixel 9', pair_request_id: 'pair-request-1' }],
    primary_device_state: { local_role: 'primary', primary_device_id: 'device-desktop' },
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

it('disconnects paired companion devices through the native bridge', async () => {
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

  await removeDesktopCompanionPairedDevice('android-1');
  await clearDesktopCompanionPairedDevices();

  expect(invoke).toHaveBeenNthCalledWith(1, 'remove_companion_paired_device', {
    device_id: 'android-1'
  });
  expect(invoke).toHaveBeenNthCalledWith(2, 'clear_companion_paired_devices');
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

it('sets the desktop as primary through the native bridge', async () => {
  const invoke = vi.fn().mockResolvedValue({
    pending_requests: [],
    primary_device_state: {
      can_initiate_takeover: false,
      local_role: 'primary',
      primary_device_id: 'device-desktop',
      source: 'committed-primary-device',
      takeover_blocked_reasons: []
    },
    server_status: {
      advertised_urls: [],
      last_error: null,
      paired_device_count: 1,
      pending_pair_request_count: 0,
      port: 38641,
      state: 'running'
    },
    sync_enabled: true
  });
  window.electronAPI = createMockElectronApi(invoke);

  await expect(setDesktopAsPrimaryDevice()).resolves.toMatchObject({
    primary_device_state: {
      local_role: 'primary',
      primary_device_id: 'device-desktop'
    }
  });

  expect(invoke).toHaveBeenCalledWith('set_desktop_as_primary_device');
});
