import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeInvoke } from '../../../lib/platform/nativeContract';

import {
  approveDesktopCompanionPairRequest,
  disableDesktopCompanionSync,
  enableDesktopCompanionSync,
  loadDesktopCompanionPairingOverview,
  removeDesktopSyncGroupMember,
  pauseDesktopCompanionSync,
  rejectDesktopCompanionPairRequest,
  resumeDesktopCompanionSync
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
    paired_authorizations: [
      {
        authorization_id: 'authorization-android',
        client_address: '192.168.1.22',
        host_name: 'A5',
        host_platform: 'android-capacitor',
        paired_at: '2026-04-24T10:03:00.000Z'
      }
    ],
    pending_requests: [
      {
        client_address: '192.168.1.22',
        host_name: 'Pixel 9',
        host_platform: 'android',
        expires_at: '2026-04-24T10:02:00.000Z',
        pair_request_id: 'pair-request-1',
        requested_at: '2026-04-24T10:00:00.000Z',
        status: 'pending'
      }
    ],
    server_status: {
      advertised_urls: ['http://127.0.0.1:38641'],
      last_error: null,
      paired_authorization_count: 1,
      pending_pair_request_count: 1,
      port: 38641,
      state: 'running'
    },
    sync_enabled: true
  });
  window.electronAPI = createMockElectronApi(invoke);

  await expect(loadDesktopCompanionPairingOverview()).resolves.toMatchObject({
    paired_authorizations: [{ authorization_id: 'authorization-android', host_name: 'A5' }],
    pending_requests: [{ client_address: '192.168.1.22', host_name: 'Pixel 9', pair_request_id: 'pair-request-1' }],
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
      paired_authorization_count: 2,
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

it('removes Sync Group members through their Host name', async () => {
  const invoke = vi.fn().mockResolvedValue({ paired_authorizations: [], pending_requests: [] });
  window.electronAPI = createMockElectronApi(invoke);

  await removeDesktopSyncGroupMember('Reading Phone');

  expect(invoke).toHaveBeenCalledWith('remove_sync_group_member', {
    host_name: 'Reading Phone'
  });
});

it('toggles desktop companion sync through the native bridge', async () => {
  const invoke = vi.fn().mockResolvedValue({
    pending_requests: [],
    server_status: {
      advertised_urls: ['http://127.0.0.1:38641'],
      last_error: null,
      paired_authorization_count: 0,
      pending_pair_request_count: 0,
      port: 38641,
      state: 'running'
    },
    sync_enabled: true
  });
  window.electronAPI = createMockElectronApi(invoke);

  await enableDesktopCompanionSync();
  await disableDesktopCompanionSync();
  await pauseDesktopCompanionSync();
  await resumeDesktopCompanionSync();

  expect(invoke).toHaveBeenNthCalledWith(1, 'enable_companion_sync');
  expect(invoke).toHaveBeenNthCalledWith(2, 'disable_companion_sync');
  expect(invoke).toHaveBeenNthCalledWith(3, 'pause_companion_sync');
  expect(invoke).toHaveBeenNthCalledWith(4, 'resume_companion_sync');
});
