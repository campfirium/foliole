import { createHash } from 'node:crypto';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FRAMED_SYNC_RECEIPT_SLOT_BYTES, type FramedSyncPayloadBudget } from '../../lib/core/sync/framedSyncPayloadBudget.js';
import { leaseFramedSyncPayloads } from '../../lib/core/sync/framedSyncPayloadLease.js';

import { encodeFramedSyncHttpBody } from './desktopFramedSyncHttpWriter.js';
import type { FramedSyncStreamBody, FramedSyncWritableBody } from './desktopFramedSyncStream.js';
import { readFramedSyncFileChunks } from './framedSyncFileChunks.js';

/** Copy each immutable stream to disk and release its owner before producing the next unit. */
export async function spoolDesktopFramedSyncSequence(input: {
  bodies: AsyncIterable<FramedSyncStreamBody & { dispose?: () => Promise<void> }>;
  payloadBudget?: FramedSyncPayloadBudget | undefined;
  lane: 'payload' | 'receipt';
}): Promise<FramedSyncWritableBody> {
  const root = await mkdtemp(join(tmpdir(), 'foliole-framed-batch-'));
  const path = join(root, 'batch.body');
  const dispose = () => rm(root, { recursive: true, force: true });
  try {
    const file = await open(path, 'wx');
    const hash = createHash('sha256');
    let contentLength = 0;
    let preamble: Uint8Array | undefined;
    try {
      for await (const body of input.bodies) {
        preamble ??= body.preamble;
        for await (const bytes of encodeFramedSyncHttpBody(body)) {
          let offset = 0;
          while (offset < bytes.byteLength) {
            const { bytesWritten } = await file.write(bytes, offset, bytes.byteLength - offset);
            if (!bytesWritten) throw new Error('framed_sync_body_write_failed');
            offset += bytesWritten;
          }
          contentLength += bytes.byteLength;
          hash.update(bytes);
        }
      }
    } finally { await file.close(); }
    if (!preamble) throw new Error('framed_sync_batch_empty');
    return { bodySha256: hash.digest('hex'), contentLength, dispose, preamble,
      encodedBytes: replaySequence(path, input),
      frames: (async function* () { yield* []; throw new Error('framed_sync_sequence_reader_required'); })() };
  } catch (error) { await dispose(); throw error; }
}

async function* replaySequence(path: string, input: Pick<Parameters<typeof spoolDesktopFramedSyncSequence>[0], 'lane' | 'payloadBudget'>) {
  if (input.lane === 'payload') {
    yield* leaseFramedSyncPayloads(readFramedSyncFileChunks(path), input.payloadBudget, 'outbound');
    return;
  }
  const source = readFramedSyncFileChunks(path);
  try {
    for (;;) {
      const loan = await input.payloadBudget?.acquireReceipt({ direction: 'outbound', bytes: FRAMED_SYNC_RECEIPT_SLOT_BYTES });
      try {
        const next = await source.next();
        if (next.done) return;
        yield next.value;
      } finally { loan?.release(); }
    }
  } finally { await source.return(undefined); }
}
