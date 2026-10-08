import { framedSyncBytes, readFramedSyncRow, sameFramedSyncBytes } from '../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { retireFramedSyncCompletedPublication } from '../../lib/core/sync/framedSyncCompletedPublication.js';
import {
  type PreparedTransferAttempt,
  type PublishedTransfer
} from '../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { FRAMED_SYNC_RESOURCE_FACT_KIND } from '../../lib/core/sync/framedSyncResourceFact.js';
import type { OutboundPublishInput } from '../../lib/core/sync/framedSyncStagingContract.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';
import { collectDeliveredParentOrderBodies } from '../../lib/core/sync/parentOrderBodyRetention.js';
import { readFramedSyncPayloadBudget } from '../database/framedSyncPayloadBudgetOwner.js';

import { loadDesktopFramedSyncBlobSources, loadDesktopFramedSyncPublishedBlobSources } from './desktopFramedSyncBlobSources.js';
import { spoolDesktopFramedSyncProducedBody } from './desktopFramedSyncBodySpool.js';
import { postDesktopFramedSync } from './desktopFramedSyncHttp.js';
import { loadDesktopFramedSyncPreparedTransferBody } from './desktopFramedSyncPreparedTransferBody.js';
import { readReceipt } from './desktopFramedSyncProcessReceipt.js';
import { newTransferAttempt } from './desktopFramedSyncProcessWire.js';
import { createDesktopFramedSyncRoundEndpoint } from './desktopFramedSyncRoundEndpoint.js';
import { writeDesktopFramedSyncTransferFrames } from './desktopFramedSyncTransferFrameWriter.js';

type Identity = Readonly<{ deviceId: string; libraryEpoch: string }>;

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
  const nodeId = input.nodeId ?? (await input.db.query<{ object_id: string }>(
    `SELECT v.object_id FROM node_sync_versions v JOIN nodes n ON n.id = v.object_id
     ORDER BY v.created_at, v.version_id LIMIT 1`))[0]?.object_id;
  if (!nodeId) throw new Error('framed_sync_source_empty');
  const endpoint = createDesktopFramedSyncRoundEndpoint({ ...input, peer: input.remote });
  const current = await endpoint.readInventoryEntry({ globalId: nodeId, objectType: 'node' });
  if (!current) throw new Error('framed_sync_source_empty');
  const difference = compareFramedSyncInventories({ local: [current], remote: [] })[0];
  if (!difference) throw new Error('framed_sync_source_empty');
  const selection = await endpoint.selectOutbound(difference);
  if (selection.kind === 'deferred') throw new Error('framed_sync_source_changed');
  await endpoint.staging.publishOutbound(selection.publication);
  await endpoint.sendPublishedTransfer({ difference, publication: selection.publication, receiver: 'remote' });
  return { transferId: Buffer.from(selection.publication.transferId).toString('hex') };
}

type PreparationInput = {
  db: DbPort;
  groupSecret: string;
  publication: OutboundPublishInput;
  staging: FramedSyncStagingPort;
};

export function prepareDesktopFramedSyncPublishedTransfer(input: PreparationInput) {
  return preparePublishedAttempt(input, writeDesktopFramedSyncTransferFrames);
}

/** The caller owns the sealed HTTP body; fixed frames still belong to durable staging. */
export async function prepareDesktopFramedSyncPublishedDelivery(input: PreparationInput) {
  let body: Awaited<ReturnType<typeof spoolDesktopFramedSyncProducedBody>> | undefined;
  try {
    const attempt = await preparePublishedAttempt(input, async (frames) => {
      body = await spoolDesktopFramedSyncProducedBody({ preamble: frames.attempt.preamble,
        payloadBudget: frames.payloadBudget,
        produce: (write) => writeDesktopFramedSyncTransferFrames({ ...frames,
          onCommittedFrame: (frame) => write({ headerBytes: frame.frameHeader, ciphertext: frame.ciphertext }) }) });
    });
    return { attempt, body: body ?? await loadDesktopFramedSyncPreparedTransferBody({ ...input, attempt }) };
  } catch (error) {
    await body?.dispose?.();
    throw error;
  }
}

async function preparePublishedAttempt(input: PreparationInput,
  writeFrames: typeof writeDesktopFramedSyncTransferFrames) {
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
    db: input.db,
    blobSources: await loadDesktopFramedSyncPublishedBlobSources(input.db, stored.manifest),
    groupSecret: input.groupSecret,
    publication: stored,
    staging: input.staging
  }, writeFrames);
}

async function persistDesktopFramedSyncAttempt(input: {
  blobSources: ReturnType<typeof loadDesktopFramedSyncBlobSources>;
  groupSecret: string;
  publication: OutboundPublishInput;
  staging: FramedSyncStagingPort;
  db: DbPort;
}, writeFrames: typeof writeDesktopFramedSyncTransferFrames) {
  const published = publishedTransfer(input.publication);
  const attempt = newTransferAttempt(published.transferId);
  await input.staging.persistOutboundAttempt(published.transferId, attempt);
  try {
    await writeFrames({
      attempt,
      payloadBudget: readFramedSyncPayloadBudget(input.db),
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
  body: Awaited<ReturnType<typeof loadDesktopFramedSyncPreparedTransferBody>>;
  groupSecret: string;
  peerOrigin: string;
  publication: OutboundPublishInput;
  staging: FramedSyncStagingPort;
}) {
  try {
    const stored = await input.staging.loadOutboundPublication(input.publication.transferId);
    if (!stored) throw new Error('framed_sync_outbound_publication_missing');
    await transmitDesktopFramedSyncPublication({ ...input, publication: stored });
  } finally { await input.body.dispose?.(); }
}

async function transmitDesktopFramedSyncPublication(input: {
  db: DbPort;
  attempt: PreparedTransferAttempt;
  body: Awaited<ReturnType<typeof loadDesktopFramedSyncPreparedTransferBody>>;
  groupSecret: string;
  peerOrigin: string;
  publication: OutboundPublishInput;
  staging: FramedSyncStagingPort;
}) {
  const published = publishedTransfer(input.publication);
  const body = input.body;
  const context = published.context;
  try {
    const response = await postDesktopFramedSync({
      body,
      payloadBudget: readFramedSyncPayloadBudget(input.db),
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
    if (input.publication.manifest.facts.some((fact) => fact.kind === FRAMED_SYNC_RESOURCE_FACT_KIND) &&
        !sameFramedSyncBytes(receipt.appliedStateHash, published.contentId)) {
      throw new Error('framed_sync_resource_receipt_mismatch');
    }
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

const groupKey = (secret: string) => new Uint8Array(Buffer.from(secret, 'base64url'));
