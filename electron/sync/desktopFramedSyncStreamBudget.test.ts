// @vitest-environment node
import { setImmediate } from 'node:timers/promises';

import { expect, it } from 'vitest';

import { encodeFrameHeader, encodeFramedSyncPreamble } from '../../lib/core/sync/framedSyncFraming.js';
import { FRAMED_SYNC_DIRECTION_PAYLOAD_BYTES, FRAMED_SYNC_RECEIPT_SLOT_BYTES,
  FramedSyncPayloadBudget } from '../../lib/core/sync/framedSyncPayloadBudget.js';

import { processFrameStream } from './desktopFramedSyncProcessWire.js';
import { readFramedSyncStream } from './desktopFramedSyncStream.js';

const preamble = encodeFramedSyncPreamble({ compression: 'none', contextId: new Uint8Array(32),
  contextKind: 'session', noncePrefix: new Uint8Array(4), sessionId: new Uint8Array(16), startingSequence: 0n });
const headerBytes = encodeFrameHeader({ ciphertextBytes: 4, flags: 0, frameType: 1, sequence: 0n });
const ciphertext = Uint8Array.of(0, 255, 1, 254);

it('allows a bounded receipt through full bidirectional data lanes and serializes competing receipts', async () => {
  const budget = new FramedSyncPayloadBudget();
  const inbound = await budget.acquire({ direction: 'inbound', bytes: FRAMED_SYNC_DIRECTION_PAYLOAD_BYTES });
  const outbound = await budget.acquire({ direction: 'outbound', bytes: FRAMED_SYNC_DIRECTION_PAYLOAD_BYTES });
  const receiptHeader = encodeFrameHeader({ ciphertextBytes: 4, flags: 0, frameType: 6, sequence: 0n });
  async function* source() { yield preamble; yield receiptHeader; yield ciphertext; }
  const stream = await readFramedSyncStream(source(), budget);
  const iterator = stream.frames[Symbol.asyncIterator]();
  expect((await iterator.next()).value?.ciphertext).toEqual(ciphertext);
  let competingGranted = false;
  const competing = budget.acquireReceipt({ direction: 'inbound', bytes: FRAMED_SYNC_RECEIPT_SLOT_BYTES })
    .then(lease => { competingGranted = true; return lease; });
  await setImmediate();
  expect(competingGranted).toBe(false);
  await iterator.return?.();
  (await competing).release();
  inbound.release(); outbound.release(); budget.close();
  await budget.drained;
});

it('reserves shared inbound capacity before reading a body and retains it until processing finishes', async () => {
  const budget = new FramedSyncPayloadBudget();
  const held = await budget.acquire({ direction: 'inbound', bytes: FRAMED_SYNC_DIRECTION_PAYLOAD_BYTES });
  let bodyReads = 0;
  async function* source() { yield preamble; yield headerBytes; bodyReads += 1; yield ciphertext; }
  const stream = await readFramedSyncStream(source(), budget);
  const iterator = stream.frames[Symbol.asyncIterator]();
  const receiving = iterator.next();
  await setImmediate();
  const beforeRelease = bodyReads;
  held.release();
  expect((await receiving).value?.ciphertext).toEqual(ciphertext);
  let granted = false;
  const competing = budget.acquire({ direction: 'inbound', bytes: FRAMED_SYNC_DIRECTION_PAYLOAD_BYTES })
    .then(lease => { granted = true; return lease; });
  await setImmediate();
  const beforeProcessingFinishes = granted;
  await iterator.return?.();
  (await competing).release();
  budget.close();
  await budget.drained;
  expect(beforeRelease).toBe(0);
  expect(beforeProcessingFinishes).toBe(false);
});

it('reserves outbound capacity before a durable frame read and releases it on consumer exit', async () => {
  const budget = new FramedSyncPayloadBudget();
  const held = await budget.acquire({ direction: 'outbound', bytes: FRAMED_SYNC_DIRECTION_PAYLOAD_BYTES });
  let reads = 0;
  let closed = false;
  async function* frames() {
    try { reads += 1; yield { headerBytes, ciphertext }; }
    finally { closed = true; }
  }
  const iterator = processFrameStream(frames(), budget)[Symbol.asyncIterator]();
  const sending = iterator.next();
  await setImmediate();
  const beforeRelease = reads;
  held.release();
  expect((await sending).value).toEqual({ headerBytes, ciphertext });
  await iterator.return?.();
  const reusable = await budget.acquire({ direction: 'outbound', bytes: FRAMED_SYNC_DIRECTION_PAYLOAD_BYTES });
  reusable.release();
  budget.close();
  await budget.drained;
  expect(beforeRelease).toBe(0);
  expect(closed).toBe(true);
});
