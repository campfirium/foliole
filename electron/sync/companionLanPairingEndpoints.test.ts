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

vi.mock('./companionPairingStore.js', () => pairingStoreMock);
vi.mock('./companionPairingEncryption.js', () => pairingEncryptionMock);

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
      device_kind: 'android-capacitor',
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

it('rejects a pair request without compatible protocol metadata before creating review state', async () => {
  const writeJson = vi.fn();

  await handlePairRequestCreate(
    createRequest({
      device_id: 'android-old',
      device_kind: 'android-capacitor',
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

it('rate limits pair completion attempts by client address before consuming approved requests', async () => {
  const writeJson = vi.fn();
  for (let index = 0; index < 10; index += 1) {
    await handlePairRequest(
      createRequest({ pair_request_id: `missing-${index}` }),
      createResponse(),
      '0.1.0-test',
      'desktop-local',
      vi.fn(),
      writeJson
    );
  }

  await handlePairRequest(
    createRequest({ pair_request_id: 'missing-10' }),
    createResponse(),
    '0.1.0-test',
    'desktop-local',
    vi.fn(),
    writeJson
  );

  expect(writeJson).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), 429, expect.objectContaining({
    error: 'pair_completion_rate_limited'
  }));
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
    deviceKind: 'android-capacitor',
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
