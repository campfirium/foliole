import { canonicalContentId, canonicalTransferId } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import {
  FRAMED_SYNC_PROTOCOL_VERSION,
  type FramedSyncContext,
  type PublishedTransfer,
  type StoredEncryptedFrame
} from '../../lib/core/sync/framedSyncContract.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';
import { loadDesktopSyncGroupInfo } from '../database/syncGroupStore.js';
import { loadSyncNodes, loadSyncNodeVersionsSince } from '../database/syncNodes.js';

import { postDesktopFramedSync } from './desktopFramedSyncHttp.js';
import { projectDesktopFramedSyncProcessTransfer } from './desktopFramedSyncProcessProjection.js';
import { readReceipt } from './desktopFramedSyncProcessReceipt.js';
import {
  encryptProtocolFrame,
  factToWire,
  manifestToWire,
  newTransferAttempt,
  processFrameStream,
  TRANSFER_FRAME_TYPES,
  wireUint64
} from './desktopFramedSyncProcessWire.js';

type LocalIdentity = Readonly<{ deviceId: string; libraryEpoch: string }>;
type Projection = ReturnType<typeof projectDesktopFramedSyncProcessTransfer>;

export async function synchronizeDesktopFramedSync(input: {
  local: LocalIdentity;
  nodeId?: string;
  peerOrigin: string;
  staging: FramedSyncStagingPort;
}) {
  const group = requiredGroup();
  const remoteDeviceId = await fetch(`${input.peerOrigin}/health`).then(async (response) => {
    if (!response.ok) throw new Error('framed_sync_peer_health_failed');
    return String((await response.json() as Record<string, unknown>).deviceId);
  });
  const context = transferContext(input.local, remoteDeviceId, group.group_id);
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
    groupKey: groupKey(group.workgroup_key),
    projection,
    published,
    staging: input.staging
  });
  await input.staging.finalizeOutboundAttempt(transferId, attempt.attemptId);
  const response = await postDesktopFramedSync({
    body: { frames: processFrameStream(frames), preamble: attempt.preamble },
    endpointUrl: input.peerOrigin,
    groupId: group.group_id,
    localDeviceId: context.senderDeviceId,
    localLibraryEpoch: context.senderLibraryEpoch,
    pathWithQuery: '/companion/framed-sync',
    remoteDeviceId: context.receiverDeviceId,
    remoteLibraryEpoch: context.receiverLibraryEpoch,
    secret: group.workgroup_key
  });
  const receipt = await readReceipt({
    groupKey: groupKey(group.workgroup_key),
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
  const payloads: Array<Readonly<{
    frameType: number;
    payload: unknown;
    payloadCase: Parameters<typeof encryptProtocolFrame>[0]['payloadCase'];
  }>> = [{
    payloadCase: 'transfer_header', frameType: TRANSFER_FRAME_TYPES.transferHeader, payload: {
      attemptId: attempt.attemptId,
      manifest: manifestToWire(projection.manifest, published.context.groupId, published.contentId),
      transferId: published.transferId
    }
  }];
  for (const fact of projection.manifest.facts) payloads.push({
    payloadCase: 'fact', frameType: TRANSFER_FRAME_TYPES.fact, payload: factToWire(fact)
  });
  payloads.push(
    { payloadCase: 'blob_chunk', frameType: TRANSFER_FRAME_TYPES.blobChunk, payload: {
      blobHash: projection.manifest.blobs[0]!.sha256,
      data: projection.bodyBlob,
      offset: wireUint64(0n),
      transferId: published.transferId
    } },
    { payloadCase: 'transfer_trailer', frameType: TRANSFER_FRAME_TYPES.transferTrailer, payload: {
      blobCount: wireUint64(published.blobCount),
      factCount: wireUint64(published.factCount),
      manifestHash: published.manifestHash,
      transferId: published.transferId
    } }
  );
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

function transferContext(local: LocalIdentity, remoteDeviceId: string, groupId: string): FramedSyncContext {
  return {
    groupId,
    protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    receiverDeviceId: remoteDeviceId,
    receiverLibraryEpoch: `${remoteDeviceId}-epoch`,
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

function requiredGroup() {
  const group = loadDesktopSyncGroupInfo();
  if (!group) throw new Error('sync_group_not_available');
  return group;
}

const groupKey = (secret: string) => new Uint8Array(Buffer.from(secret, 'base64url'));
