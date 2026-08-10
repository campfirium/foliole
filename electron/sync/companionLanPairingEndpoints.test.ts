import type http from 'node:http';
import { Readable } from 'node:stream';

import { afterEach, expect, it, vi } from 'vitest';

import {
  CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
  evaluateSyncProtocolCompatibility
} from '../../lib/platform/syncProtocolContract.js';

const pairingStoreMock = vi.hoisted(() => ({
  countPairedCompanionDevices: vi.fn(() => 1),
  registerPairedCompanionDevice: vi.fn(),
  removePairedCompanionDevice: vi.fn()
}));
const pairingEncryptionMock = vi.hoisted(() => ({
  encryptCompanionPairingSecret: vi.fn(async () => 'encrypted-device-secret'),
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
import {
  approveCompanionPairRequest,
  clearCompanionPairRequests,
  createCompanionPairRequest
} from './companionPairingRequests.js';

const TEST_PAIRING_PUBLIC_KEY = Buffer.concat([Buffer.from([4]), Buffer.alloc(64)]).toString('base64url');

afterEach(() => {
  clearCompanionPairRequests();
  vi.clearAllMocks();
  pairingEncryptionMock.encryptCompanionPairingSecret.mockResolvedValue('encrypted-device-secret');
  pairingEncryptionMock.isSupportedPairingPublicKey.mockReturnValue(true);
});

function createRequest(payload: unknown, remoteAddress = '192.168.1.22') {
  const request = Readable.from([JSON.stringify(payload)]) as http.IncomingMessage;
  Object.defineProperty(request, 'socket', {
    value: { remoteAddress }
  });
  return request;
}

function createResponse() {
  return {
    end: vi.fn(),
    writeHead: vi.fn()
  } as unknown as http.ServerResponse;
}

it('does not revoke an existing paired device before desktop approval', async () => {
  const writeJson = vi.fn();

  await handlePairRequestCreate(
    createRequest({
      device_id: 'android-1',
      device_kind: 'android',
      device_name: 'Pixel 9',
      pairing_public_key: TEST_PAIRING_PUBLIC_KEY,
      protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR
    }),
    createResponse(),
    vi.fn(),
    null,
    writeJson
  );

  expect(pairingStoreMock.removePairedCompanionDevice).not.toHaveBeenCalled();
  expect(writeJson).toHaveBeenCalledWith(expect.anything(), expect.anything(), 202, expect.objectContaining({
    status: 'pending'
  }));
});

it('registers an approved empty Windows desktop as a Sync Group member', async () => {
  pairingStoreMock.registerPairedCompanionDevice.mockReturnValue({
    device_id: 'desktop-c', device_secret: 'secret-c', paired_at: '2026-08-10T01:00:00.000Z'
  });
  const writeJson = vi.fn();
  await handlePairRequestCreate(createRequest({
    device_id: 'desktop-c', device_kind: 'win32', device_name: 'Desktop C', group_id: 'group-1',
    library_facts: { attachment_count: 0, content_blob_count: 0, node_count: 0, review_log_count: 0, timeline_id: null },
    pairing_public_key: TEST_PAIRING_PUBLIC_KEY, protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
    timeline_id: 'timeline-1'
  }), createResponse(), vi.fn(), null, writeJson);
  const requestId = writeJson.mock.calls.at(-1)?.[3]?.pair_request_id as string;
  approveCompanionPairRequest(requestId);
  await handlePairRequest(createRequest({ pair_request_id: requestId }), createResponse(),
    '0.1.0-test', 'desktop-a', vi.fn(), writeJson);

  expect(syncGroupStoreMock.registerSyncGroupMember).toHaveBeenCalledWith(expect.objectContaining({
    deviceId: 'desktop-c', deviceKind: 'win32'
  }));
  expect(writeJson).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), 200,
    expect.objectContaining({ sync_group: { group_id: 'group-1', timeline_id: 'timeline-1' } }));
});

it('rejects a pair request without compatible protocol metadata before creating review state', async () => {
  const writeJson = vi.fn();

  await handlePairRequestCreate(
    createRequest({
      device_id: 'android-old',
      device_kind: 'android',
      device_name: 'Old Android',
      pairing_public_key: TEST_PAIRING_PUBLIC_KEY
    }),
    createResponse(),
    vi.fn(),
    null,
    writeJson
  );

  expect(writeJson).toHaveBeenCalledWith(expect.anything(), expect.anything(), 409, expect.objectContaining({
    error: 'protocol_incompatible'
  }));
  expect(pairingStoreMock.registerPairedCompanionDevice).not.toHaveBeenCalled();
});

it('rechecks protocol compatibility at pair completion', async () => {
  const created = createApprovedPairRequest('android-drift');
  created.protocol.version = 2;
  const writeJson = vi.fn();

  await handlePairRequest(
    createRequest({ pair_request_id: created.pair_request_id }),
    createResponse(),
    '0.1.0-test',
    'desktop-local',
    vi.fn(),
    writeJson
  );

  expect(writeJson).toHaveBeenCalledWith(expect.anything(), expect.anything(), 409, expect.objectContaining({
    error: 'protocol_incompatible'
  }));
  expect(pairingStoreMock.registerPairedCompanionDevice).not.toHaveBeenCalled();
});

it('rate limits approved pair completion attempts by client address before re-registering devices', async () => {
  pairingStoreMock.registerPairedCompanionDevice.mockReturnValue({
    device_id: 'android-rate-limited',
    device_secret: 'device-secret-rate-limited',
    paired_at: '2026-05-10T01:00:00.000Z'
  });
  const created = createApprovedPairRequest('android-rate-limited');
  const writeJson = vi.fn();
  for (let index = 0; index < 10; index += 1) {
    await handlePairRequest(
      createRequest({ pair_request_id: created.pair_request_id }),
      createResponse(),
      '0.1.0-test',
      'desktop-local',
      vi.fn(),
      writeJson
    );
  }

  await handlePairRequest(
    createRequest({ pair_request_id: created.pair_request_id }),
    createResponse(),
    '0.1.0-test',
    'desktop-local',
    vi.fn(),
    writeJson
  );

  expect(writeJson).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), 429, expect.objectContaining({
    error: 'pair_completion_rate_limited'
  }));
  expect(pairingStoreMock.registerPairedCompanionDevice).toHaveBeenCalledTimes(1);
});

it('retries half-committed pair completion without re-registering the device', async () => {
  pairingStoreMock.registerPairedCompanionDevice.mockReturnValue({
    device_id: 'android-1',
    device_secret: 'device-secret-1',
    paired_at: '2026-05-10T01:00:00.000Z'
  });
  pairingEncryptionMock.encryptCompanionPairingSecret
    .mockRejectedValueOnce(new Error('encrypt failed'))
    .mockResolvedValueOnce('encrypted-device-secret-1');
  const created = createApprovedPairRequest('android-1');
  const writeJson = vi.fn();

  await expect(handlePairRequest(
    createRequest({ pair_request_id: created.pair_request_id }),
    createResponse(),
    '0.1.0-test',
    'desktop-local',
    vi.fn(),
    writeJson
  )).rejects.toThrow('encrypt failed');
  await handlePairRequest(
    createRequest({ pair_request_id: created.pair_request_id }),
    createResponse(),
    '0.1.0-test',
    'desktop-local',
    vi.fn(),
    writeJson
  );

  expect(pairingStoreMock.registerPairedCompanionDevice).toHaveBeenCalledTimes(1);
  expect(pairingEncryptionMock.encryptCompanionPairingSecret).toHaveBeenLastCalledWith({
    clientPublicKey: TEST_PAIRING_PUBLIC_KEY,
    deviceSecret: 'device-secret-1'
  });
  expect(writeJson).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), 200, expect.objectContaining({
    encrypted_device_secret: 'encrypted-device-secret-1'
  }));
});

it('rotates the device secret for a new approved pair request with the same device id', async () => {
  pairingStoreMock.registerPairedCompanionDevice
    .mockReturnValueOnce({
      device_id: 'android-1',
      device_secret: 'device-secret-1',
      paired_at: '2026-05-10T01:00:00.000Z'
    })
    .mockReturnValueOnce({
      device_id: 'android-1',
      device_secret: 'device-secret-2',
      paired_at: '2026-05-10T02:00:00.000Z'
    });
  const first = createApprovedPairRequest('android-1');
  const second = createApprovedPairRequest('android-1');
  const writeJson = vi.fn();

  await handlePairRequest(createRequest({ pair_request_id: first.pair_request_id }), createResponse(), '0.1.0-test', 'desktop-local', vi.fn(), writeJson);
  await handlePairRequest(createRequest({ pair_request_id: second.pair_request_id }), createResponse(), '0.1.0-test', 'desktop-local', vi.fn(), writeJson);

  expect(pairingStoreMock.registerPairedCompanionDevice).toHaveBeenCalledTimes(2);
  expect(pairingEncryptionMock.encryptCompanionPairingSecret).toHaveBeenLastCalledWith({
    clientPublicKey: TEST_PAIRING_PUBLIC_KEY,
    deviceSecret: 'device-secret-2'
  });
});

function createApprovedPairRequest(deviceId: string) {
  const protocol = {
    ...CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
    capabilities: [...CURRENT_SYNC_PROTOCOL_DESCRIPTOR.capabilities]
  };
  const created = createCompanionPairRequest({
    compatibility: evaluateSyncProtocolCompatibility(protocol),
    clientAddress: '192.168.1.22',
    deviceId,
    deviceKind: 'android',
    deviceName: 'Pixel 9',
    pairingPublicKey: TEST_PAIRING_PUBLIC_KEY,
    protocol
  });
  if (created.rate_limited) {
    throw new Error('unexpected_pair_request_rate_limit');
  }
  approveCompanionPairRequest(created.request.pair_request_id);
  return created.request;
}
