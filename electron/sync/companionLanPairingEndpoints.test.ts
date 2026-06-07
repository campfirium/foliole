import type http from 'node:http';
import { Readable } from 'node:stream';

import { afterEach, expect, it, vi } from 'vitest';

const pairingStoreMock = vi.hoisted(() => ({
  countPairedCompanionDevices: vi.fn(() => 1),
  registerPairedCompanionDevice: vi.fn(),
  removePairedCompanionDevice: vi.fn()
}));

vi.mock('./companionPairingStore.js', () => pairingStoreMock);

import { handlePairRequest, handlePairRequestCreate } from './companionLanPairingEndpoints.js';
import { clearCompanionPairRequests } from './companionPairingRequests.js';

const TEST_PAIRING_PUBLIC_KEY = Buffer.concat([Buffer.from([4]), Buffer.alloc(64)]).toString('base64url');

afterEach(() => {
  clearCompanionPairRequests();
  vi.clearAllMocks();
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
      pairing_public_key: TEST_PAIRING_PUBLIC_KEY
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
