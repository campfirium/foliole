import { canonicalContentId, canonicalTransferId } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import {
  FRAMED_SYNC_PROTOCOL_VERSION,
  type FramedSyncContext,
  type PublishedTransfer,
  type StoredEncryptedFrame
} from '../../lib/core/sync/framedSyncContract.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';
import { buildFramedSyncTransferPayloads } from '../../lib/core/sync/framedSyncTransferPayloads.js';
import { loadSyncNodes, loadSyncNodeVersionsSince } from '../database/syncNodes.js';

import { postDesktopFramedSync } from './desktopFramedSyncHttp.js';
import { projectDesktopFramedSyncProcessTransfer } from './desktopFramedSyncProcessProjection.js';
import { readReceipt } from './desktopFramedSyncProcessReceipt.js';
import {
  encryptProtocolFrame,
  newTransferAttempt,
  processFrameStream
} from './desktopFramedSyncProcessWire.js';
import { framedSyncEncodedLength, framedSyncEncodedSha256 } from './desktopFramedSyncStream.js';

type Identity = Readonly<{ deviceId: string; libraryEpoch: string }>;
type Projection = ReturnType<typeof projectDesktopFramedSyncProcessTransfer>;

export async function synchronizeDesktopFramedSync(input: {
  groupId: string;
  groupSecret: string;
  local: Identity;
  nodeId?: string;
  peerOrigin: string;
  remote: Identity;
  staging: FramedSyncStagingPort;
}) {
  const context = transferContext(input.local, input.remote, input.groupId);
  const source = input.nodeId
    ? loadSyncNodes([input.nodeId])[0]
    : loadSyncNodeVersionsSince(null, 1)[0];
  if (!source) throw new Error('framed_sync_source_empty');
  const projection = projectDesktopFramedSyncProcessTransfer(source);
  const contentId = await canonicalContentId(projection.manifest);
  const transferId = await canonicalTransferId(context, contentId);
  const published = publication(context, projection, contentId, transferId);
  await input.staging.publishOutbound({ ...published, manifest: projection.manifest });
  const attempt = newTransferAttempt(transferId);
  await input.staging.persistOutboundAttempt(transferId, attempt);
  const frames = await createTransferFrames({
    attempt,
    groupKey: groupKey(input.groupSecret),
    projection,
    published,
    staging: input.staging
  });
  await input.staging.finalizeOutboundAttempt(transferId, attempt.attemptId);
  const response = await postDesktopFramedSync({
    body: {
      bodySha256: framedSyncEncodedSha256(attempt.preamble, frames),
      contentLength: framedSyncEncodedLength(attempt.preamble, frames),
      frames: processFrameStream(frames),
      preamble: attempt.preamble
    },
    endpointUrl: input.peerOrigin,
    groupId: input.groupId,
    localDeviceId: context.senderDeviceId,
    localLibraryEpoch: context.senderLibraryEpoch,
    pathWithQuery: '/companion/framed-sync',
    remoteDeviceId: context.receiverDeviceId,
    remoteLibraryEpoch: context.receiverLibraryEpoch,
    secret: input.groupSecret
  });
  const receipt = await readReceipt({
    groupKey: groupKey(input.groupSecret),
    published,
    stream: response.stream
  });
  await input.staging.commitOutboundReceipt(receipt);
  await input.staging.releaseOutboundHolds(transferId);
  return { transferId: Buffer.from(transferId).toString('hex') };
}

async function createTransferFrames(input: {
  attempt: ReturnType<typeof newTransferAttempt>;
  groupKey: Uint8Array;
  projection: Projection;
  published: PublishedTransfer;
  staging: FramedSyncStagingPort;
}) {
  const { attempt, projection, published } = input;
  const payloads = buildFramedSyncTransferPayloads({
    attemptId: attempt.attemptId,
    blobContents: [{ data: projection.bodyBlob, sha256: projection.manifest.blobs[0]!.sha256 }],
    manifest: projection.manifest,
    published
  });
  const frames: StoredEncryptedFrame[] = [];
  for (let index = 0; index < payloads.length; index += 1) {
    const { payloadCase, frameType, payload } = payloads[index]!;
    const frame = await encryptProtocolFrame({
      attempt,
      frameType,
      groupKey: input.groupKey,
      payload,
      payloadCase,
      sequence: BigInt(index),
      transferId: published.transferId
    });
    await input.staging.commitOutboundFrame(published.transferId, attempt.attemptId, frame);
    frames.push(frame);
  }
  return frames;
}

function transferContext(local: Identity, remote: Identity, groupId: string): FramedSyncContext {
  return {
    groupId,
    protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    receiverDeviceId: remote.deviceId,
    receiverLibraryEpoch: remote.libraryEpoch,
    senderDeviceId: local.deviceId,
    senderLibraryEpoch: local.libraryEpoch
  };
}

function publication(context: FramedSyncContext, projection: Projection, contentId: Uint8Array,
  transferId: Uint8Array): PublishedTransfer {
  return {
    blobCount: BigInt(projection.manifest.blobs.length),
    contentId,
    context,
    factCount: BigInt(projection.manifest.facts.length),
    manifestHash: contentId,
    totalBlobBytes: projection.manifest.blobs.reduce((total, blob) => total + blob.byteLength, 0n),
    transferId
  };
}

const groupKey = (secret: string) => new Uint8Array(Buffer.from(secret, 'base64url'));
