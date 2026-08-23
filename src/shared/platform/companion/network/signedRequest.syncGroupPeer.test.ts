import { beforeEach, expect, it, vi } from 'vitest';

import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../../../../lib/platform/syncProtocolContract';

const nativeMock = vi.hoisted(() => ({
  addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  androidAvailable: true,
  loadPairingState: vi.fn(),
  resolveSyncGroupDataRequest: vi.fn(),
  signCompanionSyncRequest: vi.fn()
}));
const groupMock = vi.hoisted(() => ({ load: vi.fn() }));

vi.mock('../../companionUuid', () => ({ createCompanionUuid: () => 'nonce-1' }));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: nativeMock,
  isAvailableNativeAndroidCompanionRuntime: () => nativeMock.androidAvailable,
  isNativeCompanionPairingRuntime: () => true
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
  nativeMock.androidAvailable = true;
  nativeMock.loadPairingState.mockResolvedValue({
    device_id: 'mobile-b', device_kind: 'android-capacitor', is_paired: true,
    negotiated_protocol_version: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version,
    remote_protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR
  });
  groupMock.load.mockResolvedValue({ group_id: 'group-1' });
  nativeMock.signCompanionSyncRequest.mockResolvedValue({
    headers: {
      'X-Authorization-Id': 'mobile-b', 'X-Nonce': 'nonce-1', 'X-Signature': 'signed',
      'X-Timestamp': '2026-08-09T00:00:00.000Z'
    }
  });
});

it('skips optional Android workgroup wrapping on iOS', async () => {
  nativeMock.androidAvailable = false;

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

it('uses the persistent Sync Group even when legacy pairing metadata names the latest remote host', async () => {
  nativeMock.loadPairingState.mockResolvedValue({
    device_id: 'mobile-b', device_kind: 'win32', is_paired: true,
    negotiated_protocol_version: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version,
    remote_peer_id: 'desktop-c', remote_protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR
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

it('rejects an old pairing profile before signing a Sync Group request', async () => {
  nativeMock.loadPairingState.mockResolvedValue({
    device_id: 'mobile-b', device_kind: 'android-capacitor', is_paired: true,
    negotiated_protocol_version: 2,
    remote_protocol: {
      ...CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
      max_supported_version: 2,
      min_supported_version: 2,
      version: 2
    }
  });

  await expect(createSignedRequestHeaders({
    endpointUrl: 'http://192.168.0.11:38641', method: 'GET',
    pathWithQuery: '/companion/sync-pack?after_state_seq=7'
  })).rejects.toThrow('sync_protocol_incompatible');
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

it('keeps standalone native signing free of Sync Group credentials', async () => {
  groupMock.load.mockResolvedValue(null);

  await createSignedRequestHeaders({
    endpointUrl: 'http://192.168.0.11:38641', method: 'GET',
    pathWithQuery: '/companion/workspace-version'
  });

  expect(nativeMock.signCompanionSyncRequest).toHaveBeenCalledWith(expect.not.objectContaining({
    sync_group_id: expect.anything(), workgroup_key: expect.anything()
  }));
});
