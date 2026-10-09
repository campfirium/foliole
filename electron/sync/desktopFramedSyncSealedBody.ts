import { rm } from 'node:fs/promises';

import type { FramedSyncPayloadBudget } from '../../lib/core/sync/framedSyncPayloadBudget.js';
import { leaseFramedSyncPayloads } from '../../lib/core/sync/framedSyncPayloadLease.js';

import { readFramedSyncStream, type FramedSyncWritableBody } from './desktopFramedSyncStream.js';
import { readFramedSyncFileChunks } from './framedSyncFileChunks.js';

const owners = new WeakMap<FramedSyncWritableBody, () => FramedSyncWritableBody>();

/** Each delivery owns a reader; the immutable request file survives until all readers release it. */
export function createDesktopFramedSyncSealedBody(input: {
  root: string; path: string; preamble: Uint8Array; bodySha256: string; contentLength: number;
  uncompressedMessageBytes: number | undefined; payloadBudget?: FramedSyncPayloadBudget | undefined;
}) {
  let references = 0;
  function retain(): FramedSyncWritableBody {
    references++;
    let disposed = false;
    async function dispose() {
      if (disposed) return;
      disposed = true;
      if (--references === 0) await rm(input.root, { recursive: true, force: true });
    }
    const body = { bodySha256: input.bodySha256, contentLength: input.contentLength,
      uncompressedMessageBytes: input.uncompressedMessageBytes, preamble: input.preamble, dispose,
      encodedBytes: leaseFramedSyncPayloads(readFramedSyncFileChunks(input.path), input.payloadBudget, 'outbound'),
      frames: replay(input.path, dispose, input.payloadBudget) };
    owners.set(body, () => {
      if (disposed) throw new Error('framed_sync_sealed_body_released');
      return retain();
    });
    return body;
  }
  return retain();
}

export function retainDesktopFramedSyncSealedBody(body: FramedSyncWritableBody) {
  const retain = owners.get(body);
  if (!retain) throw new Error('framed_sync_sealed_body_owner_missing');
  return retain();
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
