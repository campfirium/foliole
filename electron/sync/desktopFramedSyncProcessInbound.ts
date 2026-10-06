import type { DbPort } from '../../lib/core/sync/dbPort.js';
import {
  canonicalManifestBytes,
  type CanonicalFact,
  type CanonicalManifest
} from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import type { FramedSyncContext, PublishedTransfer } from '../../lib/core/sync/framedSyncContract.js';
import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { assertFramedSyncNodeParentDependencies } from '../../lib/core/sync/framedSyncNodeParentDependencies.js';
import type {
  FramedSyncStagingPort,
  InboundFactDescriptor,
  InboundFrameInput
} from '../../lib/core/sync/framedSyncStagingContract.js';
import type { FramedSyncBlobContent } from '../../lib/core/sync/framedSyncTransferPayloads.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { upsertTextBodyBlob } from '../../lib/core/sync/syncNodeTextBodyBlobs.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';
import { applyDesktopFramedSyncRelationReviewFactsWithDbPort } from '../database/desktopFramedSyncRelationReviewApply.js';
import { createDesktopFramedSyncStaging } from '../database/desktopFramedSyncStaging.js';

import type { DesktopFramedSyncInboundResourceStore } from './desktopFramedSyncInboundResourceStore.js';
import { restoreDesktopFramedSyncNodeRecord } from './desktopFramedSyncNodeProjection.js';

type Header = Readonly<{
  blobs: CanonicalManifest['blobs'];
  facts: readonly InboundFactDescriptor[];
  published: PublishedTransfer;
}>;

export async function admitDesktopFramedSyncTransfer(input: {
  attemptId: Uint8Array;
  firstFrame: InboundFrameInput;
  header: Header;
  staging: FramedSyncStagingPort;
}) {
  const published = input.header.published;
  const proposal = {
    blobCount: published.blobCount,
    contentId: published.contentId,
    context: published.context,
    factCount: published.factCount,
    totalBlobBytes: published.totalBlobBytes,
    transferId: published.transferId
  };
  const { reservationId } = await input.staging.admitInboundProposal(proposal);
  await input.staging.commitInboundHeaderDeclaration({
    attemptId: input.attemptId,
    blobs: input.header.blobs,
    facts: input.header.facts,
    proposal,
    published,
    reservationId
  });
  try {
    await input.staging.commitAuthenticatedFrame(input.firstFrame);
    await input.staging.commitBlobOfferAndMissingSet({
      blobs: input.header.blobs,
      transferId: published.transferId
    });
  } catch (error) {
    await input.staging.invalidateInboundAttempt(published.transferId, input.attemptId);
    throw error;
  }
}

export async function stageDesktopFramedSyncFact(input: {
  fact: CanonicalFact;
  frame: InboundFrameInput;
  staging: FramedSyncStagingPort;
}) {
  await input.staging.commitAuthenticatedFrame(input.frame);
  await input.staging.stageInboundFact({
    attemptId: input.frame.attemptId,
    canonicalBytes: canonicalFactBytes(input.fact),
    factId: input.fact.factId,
    factKind: input.fact.kind,
    globalId: input.fact.globalId,
    objectType: input.fact.objectType,
    transferId: input.frame.transferId
  });
}

export async function stageDesktopFramedSyncBlob(input: {
  data: Uint8Array;
  frame: InboundFrameInput;
  offset: bigint;
  sha256: Uint8Array;
  staging: FramedSyncStagingPort;
}) {
  await input.staging.commitAuthenticatedFrame(input.frame);
  await input.staging.writeBlobChunk({
    attemptId: input.frame.attemptId,
    data: input.data,
    offset: input.offset,
    sha256: input.sha256,
    transferId: input.frame.transferId
  });
}

export async function finishDesktopFramedSyncTransfer(input: {
  blobs: readonly FramedSyncBlobContent[];
  blobCount: bigint;
  context: FramedSyncContext;
  db: DbPort;
  facts: readonly CanonicalFact[];
  factCount: bigint;
  frame: InboundFrameInput;
  manifestHash: Uint8Array;
  resources: Pick<DesktopFramedSyncInboundResourceStore, 'complete'>;
  staging: FramedSyncStagingPort;
}) {
  const prepared = prepareInboundApply(input.facts, input.blobs);
  await input.staging.commitAuthenticatedFrame(input.frame);
  for (const blob of input.blobs) {
    await input.staging.verifyAndMarkBlobAvailable(
      input.frame.transferId, input.frame.attemptId, blob.sha256
    );
  }
  await input.staging.finalizeInboundAttempt({
    attemptId: input.frame.attemptId,
    blobCount: input.blobCount,
    factCount: input.factCount,
    manifestHash: input.manifestHash,
    transferId: input.frame.transferId
  });
  await input.resources.complete(prepared.records);
  await input.staging.markReadyToApply(input.frame.transferId);
  const receipt = await input.db.transaction(async (tx) => {
    await assertFramedSyncNodeParentDependencies(tx, prepared.records);
    if (prepared.records.length) {
      await promoteFramedNodeBodies(tx, prepared.records);
      await applySyncNodesWithDbPort(tx, prepared.records);
    }
    await applyDesktopFramedSyncRelationReviewFactsWithDbPort(tx, prepared.relationReviewFacts);
    const appliedStateHash = (await readFramedSyncInventoryEntry(tx, {
      globalId: prepared.globalId, objectType: 'node'
    }))?.sharedStateHash;
    if (!appliedStateHash) throw new Error('framed_sync_process_inventory_missing');
    return createDesktopFramedSyncStaging(tx).commitApplyAndReceipt({
      appliedStateHash,
      contentId: input.manifestHash,
      receiverDeviceId: input.context.receiverDeviceId,
      receiverLibraryEpoch: input.context.receiverLibraryEpoch,
      transferId: input.frame.transferId
    });
  });
  await input.staging.releasePins(input.frame.transferId, 'business_reference_committed');
  return receipt;
}

async function promoteFramedNodeBodies(
  db: DbPort,
  records: readonly NativeSyncNodeRecord[]
) {
  for (const record of records) {
    const hash = record.snapshot.body_blob_hash;
    if (!hash || record.body_text === null) {
      throw new Error('framed_sync_node_body_projection_missing');
    }
    await upsertTextBodyBlob(db, record.body_text, record.updated_at, hash);
  }
}

function prepareInboundApply(
  facts: readonly CanonicalFact[],
  blobs: readonly FramedSyncBlobContent[]
) {
  const nodeFacts = facts.filter((fact) => fact.kind === 2);
  const relationReviewFacts = facts.filter((fact) => fact.kind === 3 || fact.kind === 4);
  const supported = nodeFacts.length + relationReviewFacts.length === facts.length;
  const globalId = facts[0]?.globalId;
  if (!globalId || !supported ||
      facts.some((fact) => fact.objectType !== 'node' || fact.globalId !== globalId)) {
    throw new Error('framed_sync_process_fact_set_invalid');
  }
  if (!nodeFacts.length) {
    if (blobs.length !== 0) throw new Error('framed_sync_blob_content_set_mismatch');
    return { globalId, records: [], relationReviewFacts };
  }
  const contentByHash = new Map(blobs.map((entry) => [hex(entry.sha256), entry]));
  const bodyDescriptors = nodeFacts.map((fact) => fact.blobs.filter((entry) => entry.role === 1));
  const requiredHashes = new Set(bodyDescriptors.flatMap((entries) => entries.map((entry) => hex(entry.sha256))));
  if (contentByHash.size !== blobs.length || requiredHashes.size !== blobs.length ||
      bodyDescriptors.some((entries) => entries.length !== 1)) {
    throw new Error('framed_sync_blob_content_set_mismatch');
  }
  const records = nodeFacts.map((nodeFact, index) => {
    const body = bodyDescriptors[index]![0]!;
    const content = contentByHash.get(hex(body.sha256));
    if (!content) throw new Error('framed_sync_blob_content_set_mismatch');
    return restoreDesktopFramedSyncNodeRecord({
      bodyBlob: content.data,
      manifest: { blobs: nodeFact.blobs, facts: [nodeFact] }
    });
  });
  return { globalId, records, relationReviewFacts };
}

const hex = (value: Uint8Array) => Buffer.from(value).toString('hex');

const MANIFEST_PREFIX_BYTES = 4 + new TextEncoder().encode('foliole-framed-sync-content-v1').byteLength + 4;

function canonicalFactBytes(fact: CanonicalFact) {
  const manifest = canonicalManifestBytes({ blobs: fact.blobs, facts: [fact] });
  const blobSuffixBytes = 4 + fact.blobs.reduce(
    (size, blob) => size + 4 + blob.sha256.byteLength + 8 + 4 + 1,
    0
  );
  return manifest.slice(MANIFEST_PREFIX_BYTES, manifest.byteLength - blobSuffixBytes);
}
