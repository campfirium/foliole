import http from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FRAMED_SYNC_LIMITS,
  FRAMED_SYNC_PREAMBLE
} from '../../lib/core/sync/framedSyncContract.js';
import {
  encodeFrameHeader,
  encodeFramedSyncPreamble
} from '../../lib/core/sync/framedSyncFraming.js';

import {
  FRAMED_SYNC_CONTENT_TYPE,
  framedSyncPathWithIdentity,
  handleCompanionLanFramedSyncPost
} from './companionLanFramedSyncPost.js';
import type { authenticateCompanionRequest } from './companionRequestAuth.js';
import type { FramedSyncWireFrame } from './desktopFramedSyncStream.js';

const servers: http.Server[] = [];
const preamble = encodeFramedSyncPreamble({
  compression: 'none', contextId: new Uint8Array(32), contextKind: 'session',
  noncePrefix: new Uint8Array(4), sessionId: new Uint8Array(16), startingSequence: 0n
});
const header = encodeFrameHeader({ ciphertextBytes: 3, flags: 0, frameType: 1, sequence: 0n });
const binaryBody = Buffer.concat([Buffer.from(preamble), Buffer.from(header), Buffer.from([0, 255, 7])]);

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function startHandler(authenticate: typeof authenticateCompanionRequest,
  capture: (value: unknown) => void) {
  const server = http.createServer((request, response) => {
    void handleCompanionLanFramedSyncPost({
      authenticate,
      localIdentity: { deviceId: 'desktop-b', libraryEpoch: 'epoch-b' },
      onStream: async ({ context, stream }) => {
        capture(context);
        const frames: FramedSyncWireFrame[] = [];
        for await (const frame of stream.frames) frames.push(frame);
        async function* replyFrames() { for (const frame of frames) yield frame; }
        return { frames: replyFrames(), preamble: stream.preamble };
      },
      request,
      response
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test_server_address_invalid');
  return `http://127.0.0.1:${address.port}`;
}

function requestHeaders() {
  return {
    'content-type': FRAMED_SYNC_CONTENT_TYPE,
    'x-sync-group-id': 'group-a'
  };
}

const requestPath = framedSyncPathWithIdentity({
  initiatorDeviceId: 'device-a', initiatorLibraryEpoch: 'epoch-a',
  responderDeviceId: 'desktop-b', responderLibraryEpoch: 'epoch-b'
});

describe('companion LAN framed sync POST', () => {
  it('passes authenticated HTTP identities and returns exact binary frames', async () => {
    const authenticate = vi.fn<typeof authenticateCompanionRequest>(() => ({
      device_id: 'device-a', device_name: 'Device A', ok: true
    }));
    let context: unknown;
    const origin = await startHandler(authenticate, (value) => { context = value; });
    const response = await fetch(`${origin}${requestPath}`, {
      body: binaryBody, headers: requestHeaders(), method: 'POST'
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(FRAMED_SYNC_CONTENT_TYPE);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(binaryBody);
    expect(authenticate).toHaveBeenCalledWith(expect.objectContaining({ requireMemberState: true }));
    expect(context).toEqual({
      groupId: 'group-a', initiatorDeviceId: 'device-a', initiatorLibraryEpoch: 'epoch-a',
      protocolVersion: 22, responderDeviceId: 'desktop-b', responderLibraryEpoch: 'epoch-b'
    });
  });

  it.each([
    ['truncated', binaryBody.subarray(0, -1), 400, 'framed_sync_frame_body_truncated'],
    ['oversized', oversizedStream(), 413, 'wire_frame_limit_exceeded']
  ])('rejects a %s framed body', async (_name, body, status, error) => {
    const authenticate: typeof authenticateCompanionRequest = () => ({
      device_id: 'device-a', device_name: 'Device A', ok: true
    });
    const origin = await startHandler(authenticate, () => {});
    const response = await fetch(`${origin}${requestPath}`, {
      body, headers: requestHeaders(), method: 'POST'
    });
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error });
  });
});

function oversizedStream() {
  const oversizedHeader = new Uint8Array(FRAMED_SYNC_PREAMBLE.frameHeaderBytes);
  const view = new DataView(oversizedHeader.buffer);
  view.setUint32(0, FRAMED_SYNC_LIMITS.maxCiphertextBodyBytes + 1);
  view.setUint16(12, 1);
  return Buffer.concat([Buffer.from(preamble), Buffer.from(oversizedHeader)]);
}
