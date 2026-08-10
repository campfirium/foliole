import type http from 'node:http';
import { Readable } from 'node:stream';

import { afterEach, expect, it, vi } from 'vitest';

import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';

const pairingStoreMock = vi.hoisted(() => ({
  countPairedCompanionDevices: vi.fn(() => 1),
  loadPairedSyncGroupPeer: vi.fn(() => null),
  registerPairedCompanionDevice: vi.fn(() => ({
    device_id: 'desktop-c', device_secret: 'secret-c', paired_at: '2026-08-10T01:00:00.000Z'
  })),
  savePairedSyncGroupPeer: vi.fn()
}));
const pairingEncryptionMock = vi.hoisted(() => ({
  encryptCompanionPairingSecret: vi.fn(async () => 'encrypted-secret'),
  isSupportedPairingPublicKey: vi.fn(() => true)
}));
const syncGroupStoreMock = vi.hoisted(() => ({
  isActiveSyncGroupMember: vi.fn(() => false),
  loadDesktopSyncGroup: vi.fn(() => ({ group_id: 'group-1', timeline_id: 'timeline-1' })),
  registerSyncGroupMember: vi.fn(() => ({ group_id: 'group-1', timeline_id: 'timeline-1' }))
}));

vi.mock('./companionPairingStore.js', () => pairingStoreMock);
vi.mock('./companionPairingEncryption.js', () => pairingEncryptionMock);
vi.mock('../database/syncGroupStore.js', () => syncGroupStoreMock);

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

it('registers an approved empty Windows desktop and returns bidirectional provider credentials', async () => {
  const writeJson = vi.fn();
  await handlePairRequestCreate(request({
    device_id: 'desktop-c', device_kind: 'win32', device_name: 'Desktop C', group_id: 'group-1',
    library_facts: { attachment_count: 0, content_blob_count: 0, node_count: 0, review_log_count: 0, timeline_id: null },
    pairing_public_key: PAIRING_KEY, protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR, timeline_id: 'timeline-1'
  }), response(), vi.fn(), null, writeJson);
  const requestId = writeJson.mock.calls.at(-1)?.[3]?.pair_request_id as string;
  approveCompanionPairRequest(requestId);
  await handlePairRequest(request({ pair_request_id: requestId }), response(),
    '0.1.0-test', 'desktop-a', vi.fn(), writeJson);

  expect(syncGroupStoreMock.registerSyncGroupMember).toHaveBeenCalledWith(expect.objectContaining({
    deviceId: 'desktop-c', deviceKind: 'win32'
  }));
  expect(pairingStoreMock.savePairedSyncGroupPeer).toHaveBeenCalledWith(expect.objectContaining({
    endpoint_url: 'http://192.168.1.22:38641', peer_device_id: 'desktop-c'
  }));
  expect(writeJson).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), 200,
    expect.objectContaining({ provider_device_id: 'desktop-a', provider_encrypted_device_secret: 'encrypted-secret',
      sync_group: { group_id: 'group-1', timeline_id: 'timeline-1' } }));
});
