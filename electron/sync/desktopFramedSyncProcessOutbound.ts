import { framedSyncBytes, readFramedSyncRow } from '../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { canonicalContentId, canonicalTransferId } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { retireFramedSyncCompletedPublication } from '../../lib/core/sync/framedSyncCompletedPublication.js';
import {
  FRAMED_SYNC_PROTOCOL_VERSION,
  type FramedSyncContext,
  type PreparedTransferAttempt,
  type PublishedTransfer
} from '../../lib/core/sync/framedSyncContract.js';
import type { OutboundPublishInput } from '../../lib/core/sync/framedSyncStagingContract.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';
import { collectDeliveredParentOrderBodies } from '../../lib/core/sync/parentOrderBodyRetention.js';
import { upsertTextBodyBlob } from '../../lib/core/sync/syncNodeTextBodyBlobs.js';
import { loadSyncNodes, loadSyncNodeVersionsSince } from '../database/syncNodes.js';

import { loadDesktopFramedSyncBlobSources, loadDesktopFramedSyncPublishedBlobSources } from './desktopFramedSyncBlobSources.js';
import { postDesktopFramedSync } from './desktopFramedSyncHttp.js';
import { loadDesktopFramedSyncPreparedTransferBody } from './desktopFramedSyncPreparedTransferBody.js';
import { projectDesktopFramedSyncProcessTransfer } from './desktopFramedSyncProcessProjection.js';
import { readReceipt } from './desktopFramedSyncProcessReceipt.js';
import { newTransferAttempt } from './desktopFramedSyncProcessWire.js';
import { writeDesktopFramedSyncTransferFrames } from './desktopFramedSyncTransferFrameWriter.js';

type Identity = Readonly<{ deviceId: string; libraryEpoch: string }>;
type Projection = ReturnType<typeof projectDesktopFramedSyncProcessTransfer>;

export async function synchronizeDesktopFramedSync(input: {
  db: DbPort;
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
  await input.db.transaction(async (tx) => {
    const blob = projection.manifest.blobs.find((value) => value.role === 1);
    if (!blob) throw new Error('framed_sync_body_descriptor_missing');
    await upsertTextBodyBlob(tx, source.body_text ?? '', new Date().toISOString(),
      Buffer.from(blob.sha256).toString('hex'));
    await input.staging.publishOutbound({ ...published, manifest: projection.manifest });
  });
  const attempt = await persistDesktopFramedSyncAttempt({
    blobSources: loadDesktopFramedSyncBlobSources([source], projection.manifest),
    groupSecret: input.groupSecret,
    publication: { ...published, manifest: projection.manifest },
    staging: input.staging
  });
  await transmitDesktopFramedSyncPublication({
    attempt,
    db: input.db,
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
  const replayable = await readFramedSyncRow(input.db, `SELECT * FROM framed_sync_outbound_attempts
    WHERE transfer_id = ? AND purpose = 'transfer' AND state = 'replayable' ORDER BY rowid LIMIT 1`,
  [stored.transferId]);
  if (replayable) return {
    attemptId: framedSyncBytes(replayable, 'attempt_id'),
    noncePrefix: framedSyncBytes(replayable, 'nonce_prefix'),
    preamble: framedSyncBytes(replayable, 'preamble'),
    state: 'prepared' as const
  };
  await input.db.run(`UPDATE framed_sync_outbound_attempts SET state = 'abandoned'
    WHERE transfer_id = ? AND purpose = 'transfer' AND state = 'prepared'`, [stored.transferId]);
  return persistDesktopFramedSyncAttempt({
    blobSources: await loadDesktopFramedSyncPublishedBlobSources(input.db, stored.manifest),
    groupSecret: input.groupSecret,
    publication: stored,
    staging: input.staging
  });
}

async function persistDesktopFramedSyncAttempt(input: {
  blobSources: ReturnType<typeof loadDesktopFramedSyncBlobSources>;
  groupSecret: string;
  publication: OutboundPublishInput;
  staging: FramedSyncStagingPort;
}) {
  const published = publishedTransfer(input.publication);
  const attempt = newTransferAttempt(published.transferId);
  await input.staging.persistOutboundAttempt(published.transferId, attempt);
  try {
    await writeDesktopFramedSyncTransferFrames({
      attempt,
      groupKey: groupKey(input.groupSecret),
      manifest: input.publication.manifest,
      published,
      sources: input.blobSources,
      staging: input.staging
    });
    await input.staging.finalizeOutboundAttempt(published.transferId, attempt.attemptId);
  } catch (error) {
    await input.staging.abandonOutboundAttempt(published.transferId, attempt.attemptId);
    throw error;
  }
  return attempt;
}

export async function sendDesktopFramedSyncPublishedTransfer(input: {
  db: DbPort;
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
  db: DbPort;
  attempt: PreparedTransferAttempt;
  groupSecret: string;
  peerOrigin: string;
  publication: OutboundPublishInput;
  staging: FramedSyncStagingPort;
}) {
  const published = publishedTransfer(input.publication);
  const body = await loadDesktopFramedSyncPreparedTransferBody(input);
  const context = published.context;
  try {
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
    await collectDeliveredParentOrderBodies(input.db, published.transferId);
    await retireFramedSyncCompletedPublication(input.db, published.transferId);
  } catch (error) {
    await input.staging.abandonOutboundAttempt(published.transferId, input.attempt.attemptId);
    throw error;
  }
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
