import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { canonicalContentId, canonicalTransferId } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { deriveTransferFrameKey } from '../../lib/core/sync/framedSyncCrypto.js';
import { stageFramedSyncFileBody } from '../../lib/core/sync/framedSyncFileBodies.js';
import { createFramedSyncFileStaging } from '../../lib/core/sync/framedSyncFileStaging.js';
import { decodeFrameHeader, decodeFramedSyncPreamble } from '../../lib/core/sync/framedSyncFraming.js';
import { projectFramedSyncNodeRecord } from '../../lib/core/sync/framedSyncNodeProjection.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { authenticatedDesktopFramedSyncTransferFrames, type AuthenticatedTransferFrame } from './desktopFramedSyncAuthenticatedTransferFrames.js';
import { createDesktopFramedSyncFiles } from './desktopFramedSyncFiles.js';
import { headerFromWire } from './desktopFramedSyncProcessHeader.js';
import { admitDesktopFramedSyncTransfer, stageDesktopFramedSyncBlob,
  stageDesktopFramedSyncFact } from './desktopFramedSyncProcessInbound.js';
import { newTransferAttempt, wireToFact } from './desktopFramedSyncProcessWire.js';
import { writeDesktopFramedSyncTransferFrames } from './desktopFramedSyncTransferFrameWriter.js';

export async function fileInboundFixture(record: NativeSyncNodeRecord) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-file-inbound-'));
  const senderFiles = createDesktopFramedSyncFiles(path.join(root, 'sender'));
  const sender = createFramedSyncFileStaging(senderFiles);
  const files = createDesktopFramedSyncFiles(path.join(root, 'receiver'));
  const staging = createFramedSyncFileStaging(files);
  const projection = projectFramedSyncNodeRecord(record);
  const manifest = projection.manifest;
  const contentId = await canonicalContentId(manifest);
  const context = { protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION as typeof FRAMED_SYNC_PROTOCOL_VERSION, groupId: 'group', senderDeviceId: 'sender',
    senderLibraryEpoch: 's', receiverDeviceId: 'receiver', receiverLibraryEpoch: 'r' };
  const publication = { context, contentId, manifestHash: contentId, manifest, transferId: await canonicalTransferId(context, contentId) };
  const attempt = newTransferAttempt(publication.transferId);
  const groupKey = new Uint8Array(32).fill(1);
  const published = { ...publication, factCount: BigInt(manifest.facts.length), blobCount: BigInt(manifest.blobs.length),
    totalBlobBytes: manifest.blobs.reduce((total, blob) => total + blob.byteLength, 0n) };
  try {
    await stageFramedSyncFileBody(senderFiles, manifest.blobs[0]!, projection.bodyBlob,
      { purpose: 'outbound', transferId: publication.transferId });
    await sender.publishOutbound(publication);
    await sender.persistOutboundAttempt(publication.transferId, attempt);
    await writeDesktopFramedSyncTransferFrames({ attempt, groupKey, manifest, published, staging: sender,
      sources: [{ blob: manifest.blobs[0]!, async *chunks() { yield projection.bodyBlob; } }] });
    await sender.finalizeOutboundAttempt(publication.transferId, attempt.attemptId);
    const preamble = decodeFramedSyncPreamble(attempt.preamble);
    if (preamble.contextKind !== 'transfer') throw new Error('fixture_transfer_required');
    const key = await deriveTransferFrameKey({ groupKey, attemptId: attempt.attemptId, transferId: publication.transferId });
    const stream = { preamble: attempt.preamble, frames: (async function* () {
      for await (const frame of sender.streamReplayableFrames(publication.transferId, attempt.attemptId)) {
        yield { headerBytes: frame.frameHeader, ciphertext: frame.ciphertext, header: decodeFrameHeader(frame.frameHeader) };
      }
    })() };
    for await (const event of authenticatedDesktopFramedSyncTransferFrames({ context, preamble, key, stream })) {
      await stageEvent(event, staging);
    }
    for (const blob of manifest.blobs) await staging.verifyAndMarkBlobAvailable(publication.transferId, attempt.attemptId, blob.sha256);
    await staging.finalizeInboundAttempt({ attemptId: attempt.attemptId, transferId: publication.transferId,
      manifestHash: contentId, factCount: published.factCount, blobCount: published.blobCount });
    await staging.markReadyToApply(publication.transferId);
    return { files, staging, sender, published, attempt, record, root,
      close: () => rm(root, { recursive: true, force: true }) };
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}

async function stageEvent(event: AuthenticatedTransferFrame,
  staging: ReturnType<typeof createFramedSyncFileStaging>) {
  const { decoded, frame, published } = event;
  if (decoded.payloadCase === 'transfer_header') {
    await admitDesktopFramedSyncTransfer({ staging, attemptId: frame.attemptId, firstFrame: frame,
      header: headerFromWire(decoded.payload, published) });
  } else if (decoded.payloadCase === 'fact') {
    await stageDesktopFramedSyncFact({ staging, frame, fact: wireToFact(decoded.payload) });
  } else if (decoded.payloadCase === 'blob_chunk') {
    await stageDesktopFramedSyncBlob({ staging, frame, data: decoded.payload.data as Uint8Array,
      sha256: decoded.payload.blobHash as Uint8Array, offset: BigInt(String(decoded.payload.offset)) });
    await staging.compactBodyFrame(frame);
  } else await staging.commitAuthenticatedFrame(frame);
}
