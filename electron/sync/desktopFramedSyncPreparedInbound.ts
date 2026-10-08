import type { CanonicalFact } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import type { FramedSyncContext } from '../../lib/core/sync/framedSyncContract.js';
import { decodeFramedExternalDocumentBodies } from '../../lib/core/sync/framedSyncExternalDocumentBody.js';
import { framedSyncMainBodyBlob, isFramedSyncNodeIdentityFact } from '../../lib/core/sync/framedSyncNodeFactContract.js';
import { restoreFramedSyncNodeReadingFact } from '../../lib/core/sync/framedSyncNodeReadingFact.js';
import { restoreFramedSyncNodeIdentityFact } from '../../lib/core/sync/framedSyncNodeRestore.js';
import { restoreFramedSyncObjectStateFact } from '../../lib/core/sync/framedSyncObjectStateFact.js';
import type {
  FramedSyncStagingPort,
  InboundFrameInput
} from '../../lib/core/sync/framedSyncStagingContract.js';
import type { FramedSyncBlobContent } from '../../lib/core/sync/framedSyncTransferPayloads.js';
import type {
  NativeSyncNodeRecord,
  NativeSyncObjectRecord
} from '../../lib/platform/nativeSyncContract.js';

import type { DesktopFramedSyncInboundResourceStore } from './desktopFramedSyncInboundResourceStore.js';
import { restoreDesktopFramedSyncNodeRecord } from './desktopFramedSyncNodeProjection.js';
import { desktopFramedResourceUnit } from './desktopFramedSyncResourceApply.js';

export type PreparedDesktopFramedSyncInbound = Readonly<{
  context: FramedSyncContext;
  externalBodies?: readonly Readonly<{ hash: string; text: string }>[];
  globalId: string;
  objectType: string;
  manifestHash: Uint8Array;
  records: readonly NativeSyncNodeRecord[];
  relationReviewFacts: readonly CanonicalFact[];
  resourceFacts?: readonly CanonicalFact[];
  stateRecords: readonly NativeSyncObjectRecord[];
  staging: FramedSyncStagingPort;
  transferId: Uint8Array;
}>;

export async function prepareDesktopFramedSyncInbound(input: {
  blobs: readonly FramedSyncBlobContent[];
  blobCount: bigint;
  context: FramedSyncContext;
  facts: readonly CanonicalFact[];
  factCount: bigint;
  frame: InboundFrameInput;
  manifestHash: Uint8Array;
  resources: Pick<DesktopFramedSyncInboundResourceStore, 'complete'>;
  staging: FramedSyncStagingPort;
}): Promise<PreparedDesktopFramedSyncInbound> {
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
  await input.resources.complete(prepared.records,
    (desktopFramedResourceUnit(prepared.resourceFacts ?? []) ?? []).map((entry) => entry.resource));
  await input.staging.markReadyToApply(input.frame.transferId);
  return {
    ...prepared,
    context: input.context,
    manifestHash: input.manifestHash,
    staging: input.staging,
    transferId: input.frame.transferId
  };
}

export function prepareInboundApply(
  facts: readonly CanonicalFact[],
  blobs: readonly FramedSyncBlobContent[]
) {
  const resources = desktopFramedResourceUnit(facts);
  if (resources) {
    if (blobs.length) throw new Error('framed_sync_blob_content_set_mismatch');
    return { globalId: facts[0]!.globalId, objectType: 'node', records: [],
      relationReviewFacts: [], resourceFacts: facts, stateRecords: [] };
  }
  const nodeFacts = facts.filter((fact) => fact.kind === 2);
  const stateFacts = facts.filter((fact) => fact.kind === 1);
  const relationReviewFacts = facts.filter((fact) => fact.kind === 3 || fact.kind === 4);
  const supported = nodeFacts.length + stateFacts.length + relationReviewFacts.length === facts.length;
  const globalId = facts[0]?.globalId;
  const objectType = facts[0]?.objectType;
  if (!globalId || !supported ||
      facts.some((fact) => fact.objectType !== objectType || fact.globalId !== globalId)) {
    throw new Error('framed_sync_process_fact_set_invalid');
  }
  if (!nodeFacts.length) {
    const externalBodies = decodeFramedExternalDocumentBodies(stateFacts, blobs);
    return {
      externalBodies, globalId, objectType: objectType!, records: [], relationReviewFacts,
      stateRecords: stateFacts.map((fact) => fact.objectType === 'node'
        ? restoreFramedSyncNodeReadingFact(fact) : restoreFramedSyncObjectStateFact(fact))
    };
  }
  const contentByHash = new Map(blobs.map((entry) => [hex(entry.sha256), entry]));
  const bodyDescriptors = nodeFacts.map((fact) => { const body = framedSyncMainBodyBlob(fact); return body ? [body] : []; });
  const requiredHashes = new Set(nodeFacts.flatMap((fact) => fact.blobs
    .filter((entry) => entry.role === 1 || entry.role === 5).map((entry) => hex(entry.sha256))));
  if (contentByHash.size !== blobs.length || requiredHashes.size !== blobs.length ||
      bodyDescriptors.some((entries, index) => entries.length !== (isFramedSyncNodeIdentityFact(nodeFacts[index]!) ? 0 : 1))) {
    throw new Error('framed_sync_blob_content_set_mismatch');
  }
  const records = nodeFacts.map((nodeFact, index) => {
    if (isFramedSyncNodeIdentityFact(nodeFact)) return restoreFramedSyncNodeIdentityFact(nodeFact);
    const body = bodyDescriptors[index]![0]!;
    const content = contentByHash.get(hex(body.sha256));
    if (!content) throw new Error('framed_sync_blob_content_set_mismatch');
    return restoreDesktopFramedSyncNodeRecord({
      bodyBlob: content.data,
      alternativeBodyBlobs: nodeFact.blobs.filter((entry) => entry.role === 1 && entry !== body).map((blob) => {
        const value = contentByHash.get(hex(blob.sha256));
        if (!value) throw new Error('text_alternative_body_unavailable');
        return { blob, data: value.data };
      }),
      manifest: { blobs: nodeFact.blobs, facts: [nodeFact] }
    });
  });
  return {
    globalId, objectType: objectType!, records, relationReviewFacts,
    stateRecords: stateFacts.map((fact) => fact.objectType === 'node'
        ? restoreFramedSyncNodeReadingFact(fact) : restoreFramedSyncObjectStateFact(fact))
  };
}

const hex = (value: Uint8Array) => Buffer.from(value).toString('hex');
