import type http from 'node:http';
import { Readable } from 'node:stream';

import { afterEach, expect, it, vi } from 'vitest';

const pairingStoreMock = vi.hoisted(() => ({
  countPairedCompanionDevices: vi.fn(() => 1),
  registerPairedCompanionDevice: vi.fn(),
  removePairedCompanionDevice: vi.fn()
}));

vi.mock('./companionPairingStore.js', () => pairingStoreMock);

import { handlePairRequestCreate } from './companionLanPairingEndpoints.js';
import { clearCompanionPairRequests } from './companionPairingRequests.js';

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
      device_name: 'Pixel 9'
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
