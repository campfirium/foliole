import type http from 'node:http';
import { Readable } from 'node:stream';

import { afterEach, expect, it, vi } from 'vitest';

import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';

const pairingStoreMock = vi.hoisted(() => ({
  countPairedCompanionAuthorizations: vi.fn(() => 1),
  registerPairedCompanionAuthorizationWithPeer: vi.fn((args: { authorizationId: string; hostName: string }) => ({
    authorization_id: args.authorizationId, credential_secret: 'secret-c',
    host_name: args.hostName, paired_at: '2026-08-10T01:00:00.000Z'
  }))
}));
const workgroupKeyStoreMock = vi.hoisted(() => ({
  loadDesktopWorkgroupKey: vi.fn(() => ({ group_id: 'group-1', group_key: 'group-key', group_tag: 'tag-1' }))
}));
const pairingEncryptionMock = vi.hoisted(() => ({
  encryptCompanionPairingSecret: vi.fn(async () => 'encrypted-secret'),
  isSupportedPairingPublicKey: vi.fn(() => true)
}));
const syncGroupStoreMock = vi.hoisted(() => {
  type Group = { group_id: string; local_host_name: string; timeline_id: string; members: Array<{
    authorization_id: string; host_name: string; host_platform: string;
  }> };
  return {
    isActiveSyncGroupMember: vi.fn(() => false),
    loadDesktopSyncGroup: vi.fn<() => Group>(() => ({
      group_id: 'group-1', local_host_name: 'Desktop A', members: [{
        authorization_id: 'authorization-desktop-a', host_name: 'Desktop A', host_platform: 'darwin'
      }], timeline_id: 'timeline-1'
    })),
    registerSyncGroupMember: vi.fn((args: { authorizationId: string }): Group => ({
      group_id: 'group-1', local_host_name: 'Desktop A', timeline_id: 'timeline-1',
      members: [
        { authorization_id: 'authorization-desktop-a', host_name: 'Desktop A', host_platform: 'darwin' },
        { authorization_id: args.authorizationId, host_name: 'Desktop C 2', host_platform: 'win32' }
      ]
    }))
  };
});

vi.mock('./companionPairingStore.js', () => pairingStoreMock);
vi.mock('./companionPairingEncryption.js', () => pairingEncryptionMock);
vi.mock('../database/syncGroupStore.js', () => syncGroupStoreMock);
vi.mock('./workgroupKeyStore.js', () => workgroupKeyStoreMock);

import { handlePairRequest, handlePairRequestCreate } from './companionLanPairingEndpoints.js';
import { approveCompanionPairRequest, clearCompanionPairRequests } from './companionPairingRequests.js';

const PAIRING_KEY = Buffer.concat([Buffer.from([4]), Buffer.alloc(64)]).toString('base64url');

afterEach(() => {
  clearCompanionPairRequests();
  vi.clearAllMocks();
});

function request(payload: unknown) {
  const value = Readable.from([JSON.stringify(payload)]) as http.IncomingMessage;
  Object.defineProperty(value, 'socket', { value: { remoteAddress: '192.168.1.22' } });
  return value;
}

function response() {
  return { end: vi.fn(), writeHead: vi.fn() } as unknown as http.ServerResponse;
}

it('registers an approved nonempty Windows desktop and returns bidirectional provider credentials', async () => {
  const writeJson = vi.fn();
  await handlePairRequestCreate(request({
    host_name: 'Desktop C', host_platform: 'win32', group_id: 'group-1', group_tag: 'tag-1',
    library_facts: { attachment_count: 2, content_blob_count: 2, node_count: 5, review_log_count: 8, timeline_id: null },
    pairing_public_key: PAIRING_KEY, protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR, timeline_id: 'timeline-1'
  }), response(), vi.fn(), null, writeJson);
  const requestId = writeJson.mock.calls.at(-1)?.[3]?.pair_request_id as string;
  approveCompanionPairRequest(requestId);
  await handlePairRequest(request({ pair_request_id: requestId }), response(),
    '0.1.0-test', 'desktop-a', vi.fn(), writeJson);

  expect(syncGroupStoreMock.registerSyncGroupMember).toHaveBeenCalledWith(expect.objectContaining({
    hostName: 'Desktop C', hostPlatform: 'win32'
  }));
  expect(pairingStoreMock.registerPairedCompanionAuthorizationWithPeer).toHaveBeenCalledWith(expect.objectContaining({
    peer: expect.objectContaining({
      endpoint_url: 'http://192.168.1.22:38641', peer_host_name: 'Desktop C 2'
    })
  }));
  expect(writeJson).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), 200,
    expect.objectContaining({ authorization_id: expect.any(String), host_name: 'Desktop C 2',
      provider_authorization_id: 'authorization-desktop-a',
      provider_encrypted_credential_secret: 'encrypted-secret',
      sync_group: expect.objectContaining({ group_id: 'group-1', timeline_id: 'timeline-1' }) }));
});

it('reuses the one workgroup key when a released display name is approved again', async () => {
  const writeJson = vi.fn();
  await handlePairRequestCreate(request({
    host_name: 'Desktop C', host_platform: 'win32', group_id: 'group-1', group_tag: 'tag-1',
    library_facts: { attachment_count: 2, content_blob_count: 2, node_count: 5, review_log_count: 8, timeline_id: null },
    pairing_public_key: PAIRING_KEY, protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR, timeline_id: 'timeline-1'
  }), response(), vi.fn(), null, writeJson);
  const requestId = writeJson.mock.calls.at(-1)?.[3]?.pair_request_id as string;
  approveCompanionPairRequest(requestId);
  await handlePairRequest(request({ pair_request_id: requestId }), response(),
    '0.1.0-test', 'desktop-a', vi.fn(), writeJson);

  expect(pairingStoreMock.registerPairedCompanionAuthorizationWithPeer).toHaveBeenCalledWith(expect.objectContaining({
    peer: expect.objectContaining({ peer_host_name: 'Desktop C 2' })
  }));
  expect(pairingStoreMock.registerPairedCompanionAuthorizationWithPeer.mock.calls[0]?.[0])
    .not.toHaveProperty('credentialSecret');
});

it('reissues the workgroup key to an approved active member without creating another member', async () => {
  const activeGroup = { group_id: 'group-1', local_host_name: 'Desktop A', timeline_id: 'timeline-1', members: [{
    authorization_id: 'join-a5', host_name: 'Xiaomi 23049RAD8C', host_platform: 'android-capacitor'
  }, {
    authorization_id: 'authorization-desktop-a', host_name: 'Desktop A', host_platform: 'darwin'
  }] };
  syncGroupStoreMock.loadDesktopSyncGroup.mockReturnValue(activeGroup);
  syncGroupStoreMock.registerSyncGroupMember.mockReturnValue(activeGroup);
  const writeJson = vi.fn();
  await handlePairRequestCreate(request({
    host_name: 'Xiaomi 23049RAD8C',
    host_platform: 'android-capacitor', group_id: 'group-1', group_tag: 'tag-1',
    library_facts: { attachment_count: 2, content_blob_count: 2, node_count: 1399, review_log_count: 8, timeline_id: null },
    pairing_public_key: PAIRING_KEY, protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR, timeline_id: 'timeline-1'
  }), response(), vi.fn(), null, writeJson);
  const requestId = writeJson.mock.calls.at(-1)?.[3]?.pair_request_id as string;
  approveCompanionPairRequest(requestId);
  await handlePairRequest(request({ pair_request_id: requestId }), response(),
    '0.1.0-test', 'desktop-a', vi.fn(), writeJson);

  expect(writeJson).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), 200,
    expect.objectContaining({ authorization_id: 'join-a5', host_name: 'Xiaomi 23049RAD8C',
      sync_group: expect.objectContaining({
        members: expect.arrayContaining([expect.objectContaining({ authorization_id: 'join-a5' })])
      }) }));
});

it('restores an explicitly selected active member when its current public name differs', async () => {
  const activeGroup = { group_id: 'group-1', local_host_name: 'Desktop A', timeline_id: 'timeline-1', members: [{
    authorization_id: 'join-a5', host_name: 'Xiaomi 23049RAD8C 2', host_platform: 'android-capacitor'
  }, {
    authorization_id: 'authorization-desktop-a', host_name: 'Desktop A', host_platform: 'darwin'
  }] };
  syncGroupStoreMock.loadDesktopSyncGroup.mockReturnValue(activeGroup);
  const writeJson = vi.fn();
  await handlePairRequestCreate(request({
    host_name: 'Xiaomi 23049RAD8C 2',
    host_platform: 'android-capacitor', group_id: 'group-1', group_tag: 'tag-1',
    library_facts: { attachment_count: 2, content_blob_count: 2, node_count: 1399,
      review_log_count: 8, timeline_id: null },
    pairing_public_key: PAIRING_KEY, protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
    timeline_id: 'timeline-1'
  }), response(), vi.fn(), null, writeJson);
  const requestId = writeJson.mock.calls.at(-1)?.[3]?.pair_request_id as string;
  approveCompanionPairRequest(
    requestId, Date.now(), 'recover_existing_member', 'Xiaomi 23049RAD8C 2', 'join-a5'
  );
  await handlePairRequest(request({ pair_request_id: requestId }), response(),
    '0.1.0-test', 'desktop-a', vi.fn(), writeJson);

  expect(syncGroupStoreMock.registerSyncGroupMember).toHaveBeenCalledWith(expect.objectContaining({
    authorizationId: 'join-a5', hostName: 'Xiaomi 23049RAD8C 2'
  }));
  expect(writeJson).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), 200,
    expect.objectContaining({ authorization_id: 'join-a5', host_name: 'Xiaomi 23049RAD8C' }));
});
