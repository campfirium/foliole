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

import { applyPreparedDesktopFramedSyncInbound } from './desktopFramedSyncApplyPrepared.js';
import type { DesktopFramedSyncInboundResourceStore } from './desktopFramedSyncInboundResourceStore.js';
import { prepareDesktopFramedSyncInbound } from './desktopFramedSyncPreparedInbound.js';

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
  blobs: Parameters<typeof prepareDesktopFramedSyncInbound>[0]['blobs'];
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
  const prepared = await prepareDesktopFramedSyncInbound(input);
  return (await applyPreparedDesktopFramedSyncInbound({
    db: input.db,
    transfers: [prepared]
  }))[0]!;
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
