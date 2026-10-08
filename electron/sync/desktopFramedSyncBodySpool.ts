import { createHash } from 'node:crypto';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { decodeFrameHeader, decodeFramedSyncPreamble } from '../../lib/core/sync/framedSyncFraming.js';
import type { FramedSyncPayloadBudget } from '../../lib/core/sync/framedSyncPayloadBudget.js';
import { leaseFramedSyncPayloads } from '../../lib/core/sync/framedSyncPayloadLease.js';

import { readFramedSyncStream, type FramedSyncEncodedFrame,
  type FramedSyncWritableBody } from './desktopFramedSyncStream.js';
import { readFramedSyncFileChunks } from './framedSyncFileChunks.js';

/** The signed request is immutable on disk before its HTTP producer starts. */
export async function spoolDesktopFramedSyncBody(input: {
  frames: AsyncIterable<FramedSyncEncodedFrame>;
  preamble: Uint8Array;
  payloadBudget?: FramedSyncPayloadBudget | undefined;
}): Promise<FramedSyncWritableBody> {
  return spoolDesktopFramedSyncProducedBody({
    preamble: input.preamble, payloadBudget: input.payloadBudget,
    produce: async (write) => { for await (const frame of input.frames) await write(frame); }
  });
}

export async function spoolDesktopFramedSyncProducedBody(input: {
  preamble: Uint8Array;
  payloadBudget?: FramedSyncPayloadBudget | undefined;
  produce(write: (frame: FramedSyncEncodedFrame) => Promise<void>): Promise<void>;
}): Promise<FramedSyncWritableBody> {
  const decoded = decodeFramedSyncPreamble(input.preamble);
  const root = await mkdtemp(join(tmpdir(), 'foliole-framed-body-'));
  const path = join(root, 'request.body');
  const dispose = () => rm(root, { recursive: true, force: true });
  try {
    const file = await open(path, 'wx');
    const hash = createHash('sha256');
    let contentLength = 0;
    let uncompressedMessageBytes = decoded.compression === 'none' ? input.preamble.byteLength : undefined;
    async function write(bytes: Uint8Array) {
      let offset = 0;
      while (offset < bytes.byteLength) {
        const { bytesWritten } = await file.write(bytes, offset, bytes.byteLength - offset);
        if (bytesWritten < 1) throw new Error('framed_sync_body_write_failed');
        offset += bytesWritten;
      }
      hash.update(bytes);
      contentLength += bytes.byteLength;
    }
    try {
      await write(input.preamble);
      await input.produce(async (frame) => {
        if (decodeFrameHeader(frame.headerBytes).ciphertextBytes !== frame.ciphertext.byteLength) {
          throw new Error('framed_sync_frame_body_length_mismatch');
        }
        if (uncompressedMessageBytes !== undefined) {
          const plaintextBytes = frame.ciphertext.byteLength - 16;
          uncompressedMessageBytes = plaintextBytes < 0 ? undefined : uncompressedMessageBytes + plaintextBytes;
        }
        await write(frame.headerBytes);
        await write(frame.ciphertext);
      });
    } finally { await file.close(); }
    return { bodySha256: hash.digest('hex'), contentLength, dispose, uncompressedMessageBytes,
      encodedBytes: leaseFramedSyncPayloads(readFramedSyncFileChunks(path), input.payloadBudget, 'outbound'),
      frames: replay(path, dispose, input.payloadBudget), preamble: input.preamble };
  } catch (error) {
    await dispose();
    throw error;
  }
}

async function* replay(path: string, dispose: () => Promise<void>, budget?: FramedSyncPayloadBudget) {
  const source = readFramedSyncFileChunks(path);
  try {
    const stream = await readFramedSyncStream(source);
    yield* leaseFramedSyncPayloads(stream.frames, budget, 'outbound');
  } finally {
    await source.return(undefined);
    await dispose();
  }
}
