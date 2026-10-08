import { createHash, createHmac } from 'node:crypto';
import http from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import {
  encodeFrameHeader,
  encodeFramedSyncPreamble
} from '../../lib/core/sync/framedSyncFraming.js';

import {
  FRAMED_SYNC_CONTENT_TYPE,
  FRAMED_SYNC_DEVICE_ID_HEADER,
  FRAMED_SYNC_LIBRARY_EPOCH_HEADER,
  FRAMED_SYNC_PATH
} from './companionLanFramedSyncPost.js';
import { postDesktopFramedSync } from './desktopFramedSyncHttp.js';
import { framedSyncEncodedLength, framedSyncEncodedSha256 } from './desktopFramedSyncStream.js';

const servers: http.Server[] = [];
const secret = Buffer.alloc(32, 3).toString('base64url');
const preamble = encodeFramedSyncPreamble({
  compression: 'none', contextId: new Uint8Array(32), contextKind: 'session',
  noncePrefix: new Uint8Array(4), sessionId: new Uint8Array(16), startingSequence: 0n
});
const header = encodeFrameHeader({ ciphertextBytes: 3, flags: 0, frameType: 1, sequence: 0n });

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function* requestFrames() {
  yield { ciphertext: Uint8Array.of(0, 255, 7), headerBytes: header };
}

it('disposes the owned body when request setup fails before consuming it', async () => {
  let disposed = false;
  const body = { ...requestBody(), dispose: async () => { disposed = true; } };
  await expect(postDesktopFramedSync({
    body, endpointUrl: 'invalid endpoint', groupId: 'group-a',
    localDeviceId: 'device-a', localLibraryEpoch: 'epoch-a', pathWithQuery: FRAMED_SYNC_PATH,
    remoteDeviceId: 'device-b', remoteLibraryEpoch: 'epoch-b', secret
  })).rejects.toThrow();
  expect(disposed).toBe(true);
});

describe('desktop framed sync HTTP client', () => {
  it('streams binary bytes with member auth and validates responder identity', async () => {
    let received = Buffer.alloc(0);
    const server = http.createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      received = Buffer.concat(chunks);
      expect(request.headers['x-device-id']).toBe('device-a');
      expect(request.headers['x-sync-group-id']).toBe('group-a');
      expect(request.headers['content-length']).toBe(String(preamble.byteLength + header.byteLength + 3));
      expect(request.headers['transfer-encoding']).toBeUndefined();
      expect(request.url).toContain('initiator_library_epoch=epoch-a');
      expect(request.url).toContain('responder_library_epoch=epoch-b');
      expect(request.headers['x-signature']).toBe(expectedSignature(request, received));
      response.writeHead(200, {
        'Content-Type': FRAMED_SYNC_CONTENT_TYPE,
        [FRAMED_SYNC_DEVICE_ID_HEADER]: 'device-b',
        [FRAMED_SYNC_LIBRARY_EPOCH_HEADER]: 'epoch-b'
      });
      response.write(preamble.subarray(0, 11));
      response.end(Buffer.concat([
        Buffer.from(preamble.subarray(11)), Buffer.from(header), Buffer.from([9, 0, 8])
      ]));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const endpointUrl = serverOrigin(server);

    const result = await postDesktopFramedSync({
      body: requestBody(), endpointUrl, groupId: 'group-a',
      localDeviceId: 'device-a', localLibraryEpoch: 'epoch-a', pathWithQuery: FRAMED_SYNC_PATH,
      remoteDeviceId: 'device-b', remoteLibraryEpoch: 'epoch-b', secret
    });
    const frames = [];
    for await (const frame of result.stream.frames) frames.push(frame);

    expect(received).toEqual(Buffer.concat([
      Buffer.from(preamble), Buffer.from(header), Buffer.from([0, 255, 7])
    ]));
    expectAuthenticatedContext(result.context);
    expect(frames[0]?.ciphertext).toEqual(Uint8Array.of(9, 0, 8));
  });

  it('rejects a mismatched responder identity before exposing the stream', async () => {
    const server = http.createServer(async (request, response) => {
      request.resume();
      response.writeHead(200, {
        'Content-Type': FRAMED_SYNC_CONTENT_TYPE,
        [FRAMED_SYNC_DEVICE_ID_HEADER]: 'unexpected-device',
        [FRAMED_SYNC_LIBRARY_EPOCH_HEADER]: 'epoch-b'
      });
      response.end(preamble);
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    await expect(postDesktopFramedSync({
      body: requestBody(),
      endpointUrl: serverOrigin(server),
      groupId: 'group-a', localDeviceId: 'device-a', localLibraryEpoch: 'epoch-a',
      pathWithQuery: FRAMED_SYNC_PATH, remoteDeviceId: 'device-b', remoteLibraryEpoch: 'epoch-b', secret
    })).rejects.toThrow('framed_sync_response_identity_mismatch');
  });
});

function requestBody() {
  const frames = [{ ciphertext: Uint8Array.of(0, 255, 7), headerBytes: header }];
  return {
    bodySha256: framedSyncEncodedSha256(preamble, frames),
    contentLength: framedSyncEncodedLength(preamble, frames),
    frames: requestFrames(),
    preamble
  };
}

function expectedSignature(request: http.IncomingMessage, body: Uint8Array) {
  const canonical = [
    'POST', request.url, request.headers['x-timestamp'], request.headers['x-nonce'],
    createHash('sha256').update(body).digest('hex')
  ].join('\n');
  return createHmac('sha256', secret).update(canonical).digest('hex');
}

function serverOrigin(server: http.Server) {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test_server_address_invalid');
  return `http://127.0.0.1:${address.port}`;
}

function expectAuthenticatedContext(context: unknown) {
  expect(context).toMatchObject({
    initiatorDeviceId: 'device-a', initiatorLibraryEpoch: 'epoch-a',
    responderDeviceId: 'device-b', responderLibraryEpoch: 'epoch-b'
  });
}
