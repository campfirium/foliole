import { expect, it } from 'vitest';

import { FRAMED_SYNC_BATCH_LIMITS } from '../../lib/core/sync/framedSyncBatchLimits.js';
import { encodeFrameHeader, encodeFramedSyncPreamble } from '../../lib/core/sync/framedSyncFraming.js';

import { readFramedSyncStreamSequence } from './desktopFramedSyncStreamSequence.js';

const preamble = encodeFramedSyncPreamble({ compression: 'none', contextId: new Uint8Array(32),
  contextKind: 'transfer', attemptId: new Uint8Array(16), noncePrefix: new Uint8Array(4), startingSequence: 0n });
function frame(type: number, bytes = 16, sequence = 0n) {
  return Buffer.concat([encodeFrameHeader({ ciphertextBytes: bytes, flags: 0, frameType: type, sequence }),
    Buffer.alloc(bytes, 7)]);
}
const unit = Buffer.concat([preamble, frame(2), frame(5, 16, 1n)]);
async function* chunks(bytes: Uint8Array) {
  for (let offset = 0; offset < bytes.length; offset += 7) yield bytes.subarray(offset, offset + 7);
}
async function collect(bytes: Uint8Array) {
  const units: number[][] = [];
  for await (const stream of readFramedSyncStreamSequence(chunks(bytes))) {
    const types = [];
    for await (const wire of stream.frames) types.push(wire.header.frameType);
    units.push(types);
  }
  return units;
}

it('hands off fragmented original transfer streams without combining their frames', async () => {
  expect(await collect(Buffer.concat([unit, unit]))).toEqual([[2, 5], [2, 5]]);
});

it.each([Buffer.concat([unit, preamble.subarray(0, 95)]), Buffer.concat([unit, preamble, frame(2)])])(
  'rejects a truncated later unit instead of declaring the batch complete', async bytes => {
    await expect(collect(bytes)).rejects.toThrow(/truncated|not_consumed/u);
  });

it('rejects a next unit while the previous unit has not been consumed', async () => {
  const units = readFramedSyncStreamSequence(chunks(Buffer.concat([unit, unit])));
  await units.next();
  await expect(units.next()).rejects.toThrow('framed_sync_transfer_not_consumed');
});

it('allows a large individual transfer but refuses to append another transfer', async () => {
  const large = Buffer.concat([preamble, frame(2, 1024 * 1024 + 16), frame(3, 1024 * 1024 + 16, 1n), frame(5, 16, 2n)]);
  expect(await collect(large)).toEqual([[2, 3, 5]]);
  await expect(collect(Buffer.concat([large, unit]))).rejects.toThrow('framed_sync_batch_message_limit_exceeded');
});

it('caps empty transfer count before constructing another unit', async () => {
  await expect(collect(Buffer.concat(Array.from({ length: FRAMED_SYNC_BATCH_LIMITS.maxItems + 1 }, () => unit))))
    .rejects.toThrow('framed_sync_batch_item_limit_exceeded');
});

it('keeps receipt batches separate from data transfers', async () => {
  const receipt = Buffer.concat([preamble, frame(6)]);
  expect(await collect(Buffer.concat([receipt, receipt]))).toEqual([[6], [6]]);
  await expect(collect(Buffer.concat([unit, receipt]))).rejects.toThrow('framed_sync_batch_kind_mismatch');
});
