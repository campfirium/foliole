import { expect, it } from 'vitest';

import { pipelineAttachmentBatchFrames } from './attachmentBatchFrames.js';
import type { FramedSyncEncodedFrame } from './framedSyncBinaryStream.js';
import { FRAMED_SYNC_PAYLOAD_SLOT_BYTES, FramedSyncPayloadBudget } from './framedSyncPayloadBudget.js';

function gate() {
  let resolve = () => {};
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
const frame = (index: number): FramedSyncEncodedFrame => ({ headerBytes: Uint8Array.of(index), ciphertext: new Uint8Array(128 * 1024) });

it('prepares the next frame while the current consumer is blocked and never prepares a third', async () => {
  const budget = new FramedSyncPayloadBudget();
  const second = gate();
  let reads = 0, closed = false;
  const source = (async function* () {
    try {
      for (let index = 0; index < 4; index++) {
        reads++;
        if (reads === 2) second.resolve();
        yield frame(index);
      }
    } finally { closed = true; }
  })();
  const pipeline = pipelineAttachmentBatchFrames(source, budget);
  expect((await pipeline.next()).value?.headerBytes[0]).toBe(0);
  await second.promise;
  expect(reads).toBe(2);
  // The remaining six slots fit; a seventh cannot be admitted while both pipeline slots remain owned.
  const spare = await budget.acquire({ direction: 'outbound', bytes: 6 * FRAMED_SYNC_PAYLOAD_SLOT_BYTES });
  let extraGranted = false;
  const extra = budget.acquire({ direction: 'outbound', bytes: FRAMED_SYNC_PAYLOAD_SLOT_BYTES }).then(lease => {
    extraGranted = true; return lease;
  });
  await Promise.resolve(); expect(extraGranted).toBe(false);
  await pipeline.return(undefined);
  (await extra).release(); spare.release();
  budget.close(); await budget.drained;
  expect(closed).toBe(true); expect(reads).toBe(2);
});

it('retains the prepared frame lease until its actual source read exits after cancellation', async () => {
  const budget = new FramedSyncPayloadBudget(), controller = new AbortController();
  const entered = gate(), release = gate();
  let closed = false;
  const source = (async function* () {
    try {
      yield frame(0);
      entered.resolve(); await release.promise;
      yield frame(1);
    } finally { closed = true; }
  })();
  const pipeline = pipelineAttachmentBatchFrames(source, budget, controller.signal);
  await pipeline.next(); await entered.promise;
  controller.abort();
  const closing = pipeline.return(undefined);
  let drained = false;
  budget.close(); void budget.drained.then(() => { drained = true; });
  await Promise.resolve(); await Promise.resolve();
  expect(drained).toBe(false); expect(closed).toBe(false);
  release.resolve(); await closing; await budget.drained;
  expect(closed).toBe(true);
});


it('keeps the file lease until its end frame has actually been consumed', async () => {
  let released = false;
  const source = (async function* () {
    try { yield { ...frame(0), attachmentBoundary: true as const }; }
    finally { released = true; }
    yield frame(1);
  })();
  const pipeline = pipelineAttachmentBatchFrames(source, undefined);
  await pipeline.next(); await Promise.resolve(); await Promise.resolve();
  expect(released).toBe(false);
  expect((await pipeline.next()).value?.headerBytes[0]).toBe(1);
  expect(released).toBe(true);
  await pipeline.return(undefined);
});
