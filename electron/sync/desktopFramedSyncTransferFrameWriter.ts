import { createHash } from 'node:crypto';

import type { CanonicalManifest } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import {
  FRAMED_SYNC_FRAME_TYPES,
  FRAMED_SYNC_LIMITS,
  type PreparedTransferAttempt,
  type PublishedTransfer
} from '../../lib/core/sync/framedSyncContract.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';
import { factToWire, manifestToWire, wireUint64 } from '../../lib/core/sync/framedSyncWireProjection.js';

import type { DesktopFramedSyncBlobSource } from './desktopFramedSyncBlobSources.js';
import { encryptProtocolFrame } from './desktopFramedSyncProcessWire.js';

type Payload = Readonly<{ frameType: number; payload: unknown; payloadCase:
  'blob_chunk' | 'fact' | 'transfer_header' | 'transfer_trailer' }>;

export async function writeDesktopFramedSyncTransferFrames(input: {
  attempt: PreparedTransferAttempt;
  groupKey: Uint8Array;
  manifest: CanonicalManifest;
  published: PublishedTransfer;
  sources: readonly DesktopFramedSyncBlobSource[];
  staging: FramedSyncStagingPort;
}) {
  let sequence = 0n;
  for await (const value of payloads(input)) {
    const frame = await encryptProtocolFrame({
      attempt: input.attempt,
      frameType: value.frameType,
      groupKey: input.groupKey,
      payload: value.payload,
      payloadCase: value.payloadCase,
      sequence,
      transferId: input.published.transferId
    });
    await input.staging.commitOutboundFrame(
      input.published.transferId,
      input.attempt.attemptId,
      frame
    );
    sequence += 1n;
  }
}

async function* payloads(input: Pick<Parameters<typeof writeDesktopFramedSyncTransferFrames>[0],
'attempt' | 'manifest' | 'published' | 'sources'>): AsyncGenerator<Payload> {
  yield { frameType: FRAMED_SYNC_FRAME_TYPES.transferHeader, payloadCase: 'transfer_header', payload: {
    attemptId: input.attempt.attemptId,
    manifest: manifestToWire(input.manifest, input.published.context.groupId, input.published.contentId),
    transferId: input.published.transferId
  } };
  for (const fact of input.manifest.facts) {
    yield { frameType: FRAMED_SYNC_FRAME_TYPES.fact, payloadCase: 'fact', payload: factToWire(fact) };
  }
  if (input.sources.length !== input.manifest.blobs.length) {
    throw new Error('framed_sync_blob_content_set_mismatch');
  }
  for (const source of input.sources) yield* blobPayloads(source, input.published.transferId);
  yield { frameType: FRAMED_SYNC_FRAME_TYPES.transferTrailer, payloadCase: 'transfer_trailer', payload: {
    blobCount: wireUint64(input.published.blobCount),
    factCount: wireUint64(input.published.factCount),
    manifestHash: input.published.manifestHash,
    transferId: input.published.transferId
  } };
}

async function* blobPayloads(source: DesktopFramedSyncBlobSource, transferId: Uint8Array): AsyncGenerator<Payload> {
  const hash = createHash('sha256');
  let offset = 0n;
  for await (const data of source.chunks()) {
    if (data.byteLength < 1 || data.byteLength > FRAMED_SYNC_LIMITS.blobChunkBytes ||
        offset + BigInt(data.byteLength) > source.blob.byteLength) {
      throw new Error('framed_sync_blob_content_mismatch');
    }
    hash.update(data);
    yield { frameType: FRAMED_SYNC_FRAME_TYPES.blobChunk, payloadCase: 'blob_chunk', payload: {
      blobHash: source.blob.sha256,
      data,
      offset: wireUint64(offset),
      transferId
    } };
    offset += BigInt(data.byteLength);
  }
  if (offset !== source.blob.byteLength ||
      !hash.digest().equals(Buffer.from(source.blob.sha256))) {
    throw new Error('framed_sync_blob_content_mismatch');
  }
}
