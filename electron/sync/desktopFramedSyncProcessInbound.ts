import type { DbPort } from '../../lib/core/sync/dbPort.js';
import {
  canonicalManifestBytes,
  type CanonicalFact,
  type CanonicalManifest
} from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import type { FramedSyncContext, PublishedTransfer } from '../../lib/core/sync/framedSyncContract.js';
import type {
  FramedSyncStagingPort,
  InboundFactDescriptor,
  InboundFrameInput
} from '../../lib/core/sync/framedSyncStagingContract.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { applyDesktopFramedSyncRelationReviewFactsWithDbPort } from '../database/desktopFramedSyncRelationReviewApply.js';
import { createDesktopFramedSyncStaging } from '../database/desktopFramedSyncStaging.js';

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
  await input.staging.verifyAndMarkBlobAvailable(
    input.frame.transferId,
    input.frame.attemptId,
    input.sha256
  );
}

export async function finishDesktopFramedSyncTransfer(input: {
  blob: Uint8Array;
  blobCount: bigint;
  context: FramedSyncContext;
  db: DbPort;
  facts: readonly CanonicalFact[];
  factCount: bigint;
  frame: InboundFrameInput;
  manifestHash: Uint8Array;
  staging: FramedSyncStagingPort;
}) {
  await input.staging.commitAuthenticatedFrame(input.frame);
  await input.staging.finalizeInboundAttempt({
    attemptId: input.frame.attemptId,
    blobCount: input.blobCount,
    factCount: input.factCount,
    manifestHash: input.manifestHash,
    transferId: input.frame.transferId
  });
  await input.staging.markReadyToApply(input.frame.transferId);
  const nodeFacts = input.facts.filter((fact) => fact.kind === 2);
  const relationReviewFacts = input.facts.filter((fact) => fact.kind === 3 || fact.kind === 4);
  if (nodeFacts.length !== 1 || nodeFacts.length + relationReviewFacts.length !== input.facts.length) {
    throw new Error('framed_sync_process_fact_set_invalid');
  }
  const nodeFact = nodeFacts[0]!;
  const record = restoreDesktopFramedSyncNodeRecord({
    bodyBlob: input.blob,
    manifest: { blobs: nodeFact.blobs, facts: [nodeFact] }
  });
  const receipt = await input.db.transaction(async (tx) => {
    await applySyncNodesWithDbPort(tx, [record]);
    await applyDesktopFramedSyncRelationReviewFactsWithDbPort(tx, relationReviewFacts);
    return createDesktopFramedSyncStaging(tx).commitApplyAndReceipt({
      appliedStateHash: nodeFact.sharedStateHash,
      contentId: input.manifestHash,
      receiverDeviceId: input.context.receiverDeviceId,
      receiverLibraryEpoch: input.context.receiverLibraryEpoch,
      transferId: input.frame.transferId
    });
  });
  await input.staging.releasePins(input.frame.transferId, 'business_reference_committed');
  return receipt;
}

const MANIFEST_PREFIX_BYTES = 4 + new TextEncoder().encode('foliole-framed-sync-content-v1').byteLength + 4;

function canonicalFactBytes(fact: CanonicalFact) {
  const manifest = canonicalManifestBytes({ blobs: fact.blobs, facts: [fact] });
  const blobSuffixBytes = 4 + fact.blobs.reduce(
    (size, blob) => size + 4 + blob.sha256.byteLength + 8 + 4 + 1,
    0
  );
  return manifest.slice(MANIFEST_PREFIX_BYTES, manifest.byteLength - blobSuffixBytes);
}
