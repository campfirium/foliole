import { beforeEach, expect, it, vi } from 'vitest';

const nativeMock = vi.hoisted(() => ({
  addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  nativeAvailable: true,
  resolveSyncGroupDataRequest: vi.fn(),
  signCompanionSyncRequest: vi.fn()
}));
const groupMock = vi.hoisted(() => ({ load: vi.fn() }));

vi.mock('../../companionUuid', () => ({ createCompanionUuid: () => 'nonce-1' }));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: nativeMock,
  isAvailableNativeCompanionRuntime: () => nativeMock.nativeAvailable,
  isNativeCompanionNetworkRuntime: () => true
}));
vi.mock('../sync/syncGroupStore', () => ({
  loadCompanionSyncGroup: groupMock.load
}));

import {
  createSignedRequestHeaders,
  prepareNativeCompanionWorkgroupRequest
} from './signedRequest';

beforeEach(() => {
  vi.clearAllMocks();
  nativeMock.nativeAvailable = true;
  groupMock.load.mockResolvedValue({
    created_at: '2026-08-09T00:00:00.000Z',
    devices: [{
      canonical_library_path: '/data/foliole.db', contract_version: 1,
      device_anchor: 'anchor-b', device_identity_key: 'mobile-b', device_name: 'Android B',
      joined_at: '2026-08-09T00:00:00.000Z', last_seen_at: null, left_at: null,
      platform: 'android-capacitor', state: 'active', updated_at: '2026-08-09T00:00:00.000Z'
    }],
    display_name: 'My Sync Group', group_id: 'group-1', local_device_identity_key: 'mobile-b'
  });
  nativeMock.signCompanionSyncRequest.mockResolvedValue({
    headers: {
      'X-Authorization-Id': 'mobile-b', 'X-Nonce': 'nonce-1', 'X-Signature': 'signed',
      'X-Timestamp': '2026-08-09T00:00:00.000Z'
    }
  });
});

it('skips optional workgroup wrapping outside native runtimes', async () => {
  nativeMock.nativeAvailable = false;

  const { prepareNativeCompanionWorkgroupRequestIfPresent } = await import('./signedRequest');
  await expect(prepareNativeCompanionWorkgroupRequestIfPresent({
    bodyText: '{}', endpointUrl: 'http://desktop.local', method: 'POST', pathWithQuery: '/companion/sync-push'
  })).resolves.toBeNull();
});

it('routes a Sync Group request to the exact native peer endpoint', async () => {
  await expect(createSignedRequestHeaders({
    endpointUrl: 'http://192.168.0.11:38641', method: 'GET', pathWithQuery: '/companion/workspace-version'
  })).resolves.toEqual(expect.objectContaining({ 'X-Sync-Group-Id': 'group-1' }));

  expect(nativeMock.signCompanionSyncRequest).toHaveBeenCalledWith(expect.objectContaining({
    endpoint_url: 'http://192.168.0.11:38641', sync_group_id: 'group-1'
  }));
  expect(nativeMock.signCompanionSyncRequest).toHaveBeenCalledWith(
    expect.not.objectContaining({ workgroup_key: expect.anything() })
  );
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
    body: '{"group_id":"group-1"}'
  }));
  expect(nativeMock.signCompanionSyncRequest).toHaveBeenCalledWith(
    expect.not.objectContaining({ workgroup_key: expect.anything() })
  );
});

it('uses the persistent Sync Group for the exact requested Device endpoint', async () => {
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

it('lets native code fail closed when the current-group credential is unavailable', async () => {
  nativeMock.signCompanionSyncRequest.mockRejectedValueOnce(
    new Error('sync_group_current_credential_missing')
  );

  await expect(createSignedRequestHeaders({
    endpointUrl: 'http://192.168.0.11:38641', method: 'GET',
    pathWithQuery: '/companion/workspace-version'
  })).rejects.toThrow('sync_group_current_credential_missing');
  expect(nativeMock.signCompanionSyncRequest).toHaveBeenCalledOnce();
});

it('refuses native signing when no Sync Group is active', async () => {
  groupMock.load.mockResolvedValue(null);

  await expect(createSignedRequestHeaders({
    endpointUrl: 'http://192.168.0.11:38641', method: 'GET',
    pathWithQuery: '/companion/workspace-version'
  })).rejects.toThrow('sync_group_not_joined');

  expect(nativeMock.signCompanionSyncRequest).not.toHaveBeenCalled();
});
