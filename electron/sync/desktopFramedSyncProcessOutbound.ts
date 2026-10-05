import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { canonicalContentId, canonicalTransferId } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import {
  FRAMED_SYNC_PROTOCOL_VERSION,
  type FramedSyncContext,
  type PreparedTransferAttempt,
  type PublishedTransfer,
  type StoredEncryptedFrame
} from '../../lib/core/sync/framedSyncContract.js';
import type { OutboundPublishInput } from '../../lib/core/sync/framedSyncStagingContract.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';
import { buildFramedSyncTransferPayloads } from '../../lib/core/sync/framedSyncTransferPayloads.js';
import { loadStoredSyncNodeVersionRecords } from '../../lib/core/sync/syncNodeGraph.js';
import { loadSyncNodes, loadSyncNodeVersionsSince } from '../database/syncNodes.js';

import { postDesktopFramedSync } from './desktopFramedSyncHttp.js';
import { projectDesktopFramedSyncNodeRecord } from './desktopFramedSyncNodeProjection.js';
import { loadDesktopFramedSyncPreparedTransferBody } from './desktopFramedSyncPreparedTransferBody.js';
import { projectDesktopFramedSyncProcessTransfer } from './desktopFramedSyncProcessProjection.js';
import { readReceipt } from './desktopFramedSyncProcessReceipt.js';
import { encryptProtocolFrame, newTransferAttempt } from './desktopFramedSyncProcessWire.js';

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
  const attempt = await persistDesktopFramedSyncAttempt({
    blobContents: [{ data: projection.bodyBlob, sha256: projection.manifest.blobs[0]!.sha256 }],
    groupSecret: input.groupSecret,
    publication: { ...published, manifest: projection.manifest },
    staging: input.staging
  });
  await transmitDesktopFramedSyncPublication({
    attempt,
    groupSecret: input.groupSecret,
    peerOrigin: input.peerOrigin,
    publication: { ...published, manifest: projection.manifest },
    staging: input.staging
  });
  return { transferId: Buffer.from(transferId).toString('hex') };
}

export async function prepareDesktopFramedSyncPublishedTransfer(input: {
  db: DbPort;
  groupSecret: string;
  publication: OutboundPublishInput;
  staging: FramedSyncStagingPort;
}) {
  const stored = await input.staging.loadOutboundPublication(input.publication.transferId);
  if (!stored) throw new Error('framed_sync_outbound_publication_missing');
  const records = await loadStoredSyncNodeVersionRecords(
    input.db,
    stored.manifest.facts.filter((fact) => fact.objectType === 'node').map((fact) => fact.factId)
  );
  const blobContents = [...records.values()].map((record) => {
    const projected = projectDesktopFramedSyncNodeRecord(record);
    return { data: projected.bodyBlob, sha256: projected.manifest.blobs[0]!.sha256 };
  });
  return persistDesktopFramedSyncAttempt({
    blobContents,
    groupSecret: input.groupSecret,
    publication: stored,
    staging: input.staging
  });
}

async function persistDesktopFramedSyncAttempt(input: {
  blobContents: ReadonlyArray<{ data: Uint8Array; sha256: Uint8Array }>;
  groupSecret: string;
  publication: OutboundPublishInput;
  staging: FramedSyncStagingPort;
}) {
  const published = publishedTransfer(input.publication);
  const attempt = newTransferAttempt(published.transferId);
  await input.staging.persistOutboundAttempt(published.transferId, attempt);
  await createTransferFrames({
    attempt,
    blobContents: input.blobContents,
    groupKey: groupKey(input.groupSecret),
    manifest: input.publication.manifest,
    published,
    staging: input.staging
  });
  await input.staging.finalizeOutboundAttempt(published.transferId, attempt.attemptId);
  return attempt;
}

export async function sendDesktopFramedSyncPublishedTransfer(input: {
  attempt: PreparedTransferAttempt;
  groupSecret: string;
  peerOrigin: string;
  publication: OutboundPublishInput;
  staging: FramedSyncStagingPort;
}) {
  const stored = await input.staging.loadOutboundPublication(input.publication.transferId);
  if (!stored) throw new Error('framed_sync_outbound_publication_missing');
  await transmitDesktopFramedSyncPublication({ ...input, publication: stored });
}

async function transmitDesktopFramedSyncPublication(input: {
  attempt: PreparedTransferAttempt;
  groupSecret: string;
  peerOrigin: string;
  publication: OutboundPublishInput;
  staging: FramedSyncStagingPort;
}) {
  const published = publishedTransfer(input.publication);
  const body = await loadDesktopFramedSyncPreparedTransferBody(input);
  const context = published.context;
  const response = await postDesktopFramedSync({
    body,
    endpointUrl: input.peerOrigin,
    groupId: context.groupId,
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
  await input.staging.releaseOutboundHolds(published.transferId);
}

async function createTransferFrames(input: {
  attempt: ReturnType<typeof newTransferAttempt>;
  blobContents: ReadonlyArray<{ data: Uint8Array; sha256: Uint8Array }>;
  groupKey: Uint8Array;
  manifest: OutboundPublishInput['manifest'];
  published: PublishedTransfer;
  staging: FramedSyncStagingPort;
}) {
  const { attempt, published } = input;
  const payloads = buildFramedSyncTransferPayloads({
    attemptId: attempt.attemptId,
    blobContents: input.blobContents,
    manifest: input.manifest,
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

function publishedTransfer(input: OutboundPublishInput): PublishedTransfer {
  return {
    blobCount: BigInt(input.manifest.blobs.length),
    contentId: input.contentId,
    context: input.context,
    factCount: BigInt(input.manifest.facts.length),
    manifestHash: input.manifestHash,
    totalBlobBytes: input.manifest.blobs.reduce((total, blob) => total + blob.byteLength, 0n),
    transferId: input.transferId
  };
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
