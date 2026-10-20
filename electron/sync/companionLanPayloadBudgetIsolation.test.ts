// One slow stream on the shared library payload budget must not delay another peer's framed request.
import { createHash } from 'node:crypto';
import http from 'node:http';

import { afterEach, expect, it, vi } from 'vitest';

import { encodeFrameHeader, encodeFramedSyncPreamble } from '../../lib/core/sync/framedSyncFraming.js';
import { FRAMED_SYNC_PAYLOAD_SLOT_BYTES, FramedSyncPayloadBudget } from '../../lib/core/sync/framedSyncPayloadBudget.js';
import { appendDiagnosticLog } from '../diagnostics/diagnosticLog.js';

import {
  FRAMED_SYNC_BODY_SHA256_HEADER, FRAMED_SYNC_CONTENT_TYPE, FRAMED_SYNC_DEVICE_ID_HEADER,
  FRAMED_SYNC_LIBRARY_EPOCH_HEADER, FRAMED_SYNC_PATH, framedSyncPathWithIdentity,
  handleCompanionLanFramedSyncPost
} from './companionLanFramedSyncPost.js';
import { observeSlowRequest } from './companionLanRequestTiming.js';
import { postDesktopFramedSync } from './desktopFramedSyncHttp.js';
import { framedSyncEncodedLength, framedSyncEncodedSha256 } from './desktopFramedSyncStream.js';

vi.mock('../diagnostics/diagnosticLog.js', () => ({ appendDiagnosticLog: vi.fn(async () => undefined) }));
vi.mock('../diagnostics/mainProcessDiagnostics.js', () => ({ appendMainProcessDiagnosticLog: vi.fn() }));

const HOLD_MS = 800;
const servers: http.Server[] = [];
const preamble = encodeFramedSyncPreamble({
  compression: 'none', contextId: new Uint8Array(32), contextKind: 'session',
  noncePrefix: new Uint8Array(4), sessionId: new Uint8Array(16), startingSequence: 0n
});
const objectsCiphertext = new Uint8Array(50 * 1024).fill(7);
const objectsBody = Buffer.concat([Buffer.from(preamble), Buffer.from(frameHeader(objectsCiphertext.byteLength, 0n)),
  Buffer.from(objectsCiphertext)]);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
  vi.mocked(appendDiagnosticLog).mockClear();
});

function frameHeader(bytes: number, sequence: bigint) {
  return encodeFrameHeader({ ciphertextBytes: bytes, flags: 0, frameType: 1, sequence });
}

async function listen(server: http.Server) {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test_server_address_invalid');
  return `http://127.0.0.1:${address.port}`;
}

/** Desktop responder (the "Windows" peer) whose framed response pauses or completes. */
async function startPeer(mode: 'byte_stall' | 'consumer_hold', onSent: () => void) {
  const frame = new Uint8Array(64 * 1024).fill(3);
  return listen(http.createServer(async (request, response) => {
    for await (const chunk of request) void chunk;
    response.writeHead(200, { 'Content-Type': FRAMED_SYNC_CONTENT_TYPE,
      [FRAMED_SYNC_DEVICE_ID_HEADER]: 'device-w', [FRAMED_SYNC_LIBRARY_EPOCH_HEADER]: 'epoch-w' });
    response.write(Buffer.concat([Buffer.from(preamble), Buffer.from(frameHeader(frame.byteLength, 0n))]));
    if (mode === 'byte_stall') {
      response.write(frame.subarray(0, 1024));
      onSent();
      await sleep(HOLD_MS);
      response.end(frame.subarray(1024));
    } else {
      response.end(Buffer.concat([Buffer.from(frame), Buffer.from(frameHeader(4, 1n)), Buffer.alloc(4)]));
      onSent();
    }
  }));
}

/** Mac framed POST handler receiving the "A5" objects body on the given library budget. */
async function startMacHandler(budget: FramedSyncPayloadBudget, verifiedAt: { at?: number }) {
  return listen(http.createServer((request, response) => {
    observeSlowRequest(request, response);
    void handleCompanionLanFramedSyncPost({
      authenticate: () => ({ device_id: 'device-a5', device_name: 'A5', ok: true }),
      payloadBudget: budget, localIdentity: { deviceId: 'device-mac', libraryEpoch: 'epoch-mac' },
      onStream: async ({ stream }) => {
        verifiedAt.at ??= performance.now();
        for await (const frame of stream.frames) void frame;
        async function* none() { /* empty reply */ }
        return { frames: none(), preamble: stream.preamble };
      },
      request, response
    });
  }));
}

/** Mac as client reading the peer response through the library budget; resolves when drained. */
function startMacClientRound(budget: FramedSyncPayloadBudget, endpointUrl: string, holdFirstFrame: boolean,
  onHolding: () => void) {
  return drainMacClientRound(budget, endpointUrl, holdFirstFrame, onHolding);
}

async function drainMacClientRound(budget: FramedSyncPayloadBudget, endpointUrl: string, holdFirstFrame: boolean,
  onHolding: () => void) {
  const frames = [{ ciphertext: Uint8Array.of(1, 2, 3), headerBytes: frameHeader(3, 0n) }];
  async function* body() { yield* frames; }
  const { stream } = await postDesktopFramedSync({
    body: { bodySha256: framedSyncEncodedSha256(preamble, frames), contentLength: framedSyncEncodedLength(preamble, frames),
      frames: body(), preamble },
    payloadBudget: budget, endpointUrl, groupId: 'group-a', localDeviceId: 'device-mac',
    localLibraryEpoch: 'epoch-mac', pathWithQuery: FRAMED_SYNC_PATH, remoteDeviceId: 'device-w',
    remoteLibraryEpoch: 'epoch-w', secret: Buffer.alloc(32, 3).toString('base64url')
  });
  const iterator = stream.frames[Symbol.asyncIterator]();
  if (!holdFirstFrame) onHolding();
  await iterator.next();
  if (holdFirstFrame) { onHolding(); await sleep(HOLD_MS); }
  while (!(await iterator.next()).done) { /* drain */ }
}

async function postObjects(origin: string) {
  const path = framedSyncPathWithIdentity({ initiatorDeviceId: 'device-a5', initiatorLibraryEpoch: 'epoch-a5',
    pathWithQuery: `${FRAMED_SYNC_PATH}?request=objects`, responderDeviceId: 'device-mac', responderLibraryEpoch: 'epoch-mac' });
  const sentAt = performance.now();
  const response = await fetch(`${origin}${path}`, { body: objectsBody, method: 'POST', headers: {
    'content-type': FRAMED_SYNC_CONTENT_TYPE, 'x-sync-group-id': 'group-a',
    [FRAMED_SYNC_BODY_SHA256_HEADER]: createHash('sha256').update(objectsBody).digest('hex') } });
  await response.arrayBuffer();
  expect(response.status).toBe(200);
  return sentAt;
}

async function measure(mode: 'byte_stall' | 'consumer_hold') {
  const macBudget = new FramedSyncPayloadBudget();
  const verifiedAt: { at?: number } = {};
  const macOrigin = await startMacHandler(macBudget, verifiedAt);
  let peerSent!: () => void; let holding!: () => void;
  const sent = new Promise<void>((resolve) => { peerSent = resolve; });
  const held = new Promise<void>((resolve) => { holding = resolve; });
  const round = startMacClientRound(macBudget, await startPeer(mode, () => peerSent()),
    mode === 'consumer_hold', () => holding());
  await Promise.all([sent, held]);
  await sleep(50);
  const sentAt = await postObjects(macOrigin);
  const elapsedMs = performance.now() - sentAt;
  await round;
  return { bodyVerifiedAfterMs: verifiedAt.at! - sentAt, elapsedMs };
}

it('receives another peer objects body while a peer response stalls mid-frame', async () => {
  const result = await measure('byte_stall');
  expect(result.bodyVerifiedAfterMs).toBeLessThan(HOLD_MS * 0.3);
});

it('receives another peer objects body while the desktop consumer holds a received frame', async () => {
  const result = await measure('consumer_hold');
  expect(result.bodyVerifiedAfterMs).toBeLessThan(HOLD_MS * 0.3);
});

it('replies to another peer while an outbound stream to a slow peer holds a payload slot', async () => {
  const macBudget = new FramedSyncPayloadBudget();
  const verifiedAt: { at?: number } = {};
  const macOrigin = await startMacHandler(macBudget, verifiedAt);
  const slowOutbound = await macBudget.acquire({ direction: 'outbound', bytes: FRAMED_SYNC_PAYLOAD_SLOT_BYTES });
  try {
    const sentAt = await postObjects(macOrigin);
    expect(performance.now() - sentAt).toBeLessThan(HOLD_MS * 0.3);
  } finally { slowOutbound.release(); }
});
