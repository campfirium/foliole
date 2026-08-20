import { beforeEach, expect, it, vi } from 'vitest';

const nativeMock = vi.hoisted(() => ({
  loadPairingState: vi.fn(),
  signCompanionSyncRequest: vi.fn()
}));
const groupMock = vi.hoisted(() => ({ load: vi.fn(), loadKey: vi.fn() }));

vi.mock('../../companionUuid', () => ({ createCompanionUuid: () => 'nonce-1' }));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: nativeMock,
  isNativeAndroidCompanionRuntime: () => true,
  isNativeCompanionPairingRuntime: () => true
}));
vi.mock('../sync/syncGroupStore', () => ({
  loadCompanionSyncGroup: groupMock.load,
  loadCompanionSyncGroupWorkgroupKey: groupMock.loadKey
}));

import {
  createSignedRequestHeaders,
  prepareNativeCompanionWorkgroupRequest
} from './signedRequest';

beforeEach(() => {
  vi.clearAllMocks();
  nativeMock.loadPairingState.mockResolvedValue({
    device_id: 'mobile-b', device_kind: 'android-capacitor', is_paired: true
  });
  groupMock.load.mockResolvedValue({ group_id: 'group-1' });
  groupMock.loadKey.mockResolvedValue('persistent-workgroup-key');
  nativeMock.signCompanionSyncRequest.mockResolvedValue({
    headers: {
      'X-Authorization-Id': 'mobile-b', 'X-Nonce': 'nonce-1', 'X-Signature': 'signed',
      'X-Timestamp': '2026-08-09T00:00:00.000Z'
    }
  });
});

it('routes a Sync Group request to the exact native peer endpoint', async () => {
  await expect(createSignedRequestHeaders({
    endpointUrl: 'http://192.168.0.11:38641', method: 'GET', pathWithQuery: '/companion/workspace-version'
  })).resolves.toEqual(expect.objectContaining({ 'X-Sync-Group-Id': 'group-1' }));

  expect(nativeMock.signCompanionSyncRequest).toHaveBeenCalledWith(expect.objectContaining({
    endpoint_url: 'http://192.168.0.11:38641', sync_group_id: 'group-1',
    workgroup_key: 'persistent-workgroup-key'
  }));
});

it('returns an opaque prepared envelope without exposing the persistent key', async () => {
  nativeMock.signCompanionSyncRequest.mockResolvedValueOnce({
    body: 'encrypted-departure',
    headers: {
      'X-Authorization-Id': 'mobile-b', 'X-Nonce': 'nonce-1', 'X-Signature': 'signed',
      'X-Timestamp': '2026-08-09T00:00:00.000Z'
    }
  });

  const prepared = await prepareNativeCompanionWorkgroupRequest({
    bodyText: '{"group_id":"group-1"}', endpointUrl: 'http://192.168.0.11:38641',
    method: 'POST', pathWithQuery: '/companion/sync-group/departure'
  });

  expect(prepared.body).toBe('encrypted-departure');
  expect(prepared.headers['Content-Type']).toBe('application/vnd.foliole.workgroup-aead+json');
  expect(JSON.stringify(prepared)).not.toContain('persistent-workgroup-key');
  expect(nativeMock.signCompanionSyncRequest).toHaveBeenCalledWith(expect.objectContaining({
    body: '{"group_id":"group-1"}', workgroup_key: 'persistent-workgroup-key'
  }));
});

it('uses the persistent Sync Group even when legacy pairing metadata names the latest remote host', async () => {
  nativeMock.loadPairingState.mockResolvedValue({
    device_id: 'mobile-b', device_kind: 'win32', is_paired: true, remote_peer_id: 'desktop-c'
  });

  await createSignedRequestHeaders({
    endpointUrl: 'http://192.168.0.10:38641', method: 'GET', pathWithQuery: '/companion/sync-pack'
  });

  expect(nativeMock.signCompanionSyncRequest).toHaveBeenCalledWith(expect.objectContaining({
    endpoint_url: 'http://192.168.0.10:38641', sync_group_id: 'group-1'
  }));
});

it('rejects an ambiguous target before asking the native peer store to sign', async () => {
  await expect(createSignedRequestHeaders({
    method: 'GET', pathWithQuery: '/companion/workspace-version'
  })).rejects.toThrow('Sync Group request target is required.');
  expect(nativeMock.signCompanionSyncRequest).not.toHaveBeenCalled();
});

it('rejects a missing persistent workgroup key before asking native code to sign', async () => {
  groupMock.loadKey.mockResolvedValue(null);

  await expect(createSignedRequestHeaders({
    endpointUrl: 'http://192.168.0.11:38641', method: 'GET',
    pathWithQuery: '/companion/workspace-version'
  })).rejects.toThrow('sync_group_workgroup_key_missing');
  expect(nativeMock.signCompanionSyncRequest).not.toHaveBeenCalled();
});

it('keeps standalone native signing free of Sync Group credentials', async () => {
  groupMock.load.mockResolvedValue(null);

  await createSignedRequestHeaders({
    endpointUrl: 'http://192.168.0.11:38641', method: 'GET',
    pathWithQuery: '/companion/workspace-version'
  });

  expect(groupMock.loadKey).not.toHaveBeenCalled();
  expect(nativeMock.signCompanionSyncRequest).toHaveBeenCalledWith(expect.not.objectContaining({
    sync_group_id: expect.anything(), workgroup_key: expect.anything()
  }));
});
