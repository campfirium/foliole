import { bytesToHex } from '@noble/hashes/utils.js';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import {
  canonicalContentId,
  canonicalTransferId,
  type CanonicalBlob,
  type CanonicalManifest
} from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import type { FramedSyncContext } from '../../lib/core/sync/framedSyncContract.js';
import { loadFramedExternalDocumentBody } from '../../lib/core/sync/framedSyncExternalDocumentBody.js';
import { stageFramedSyncFrozenBody } from '../../lib/core/sync/framedSyncFrozenBody.js';
import {
  revalidateFramedSyncInventorySource,
  requiredFramedSyncNodeVersionIds,
  type FramedSyncDeferredObject,
  type FramedSyncInventoryDifference,
  type FramedSyncInventoryEntry
} from '../../lib/core/sync/framedSyncInventory.js';
import { projectFramedSyncNodeIdentityFact } from '../../lib/core/sync/framedSyncNodeProjection.js';
import { selectFramedSyncNodeReadingFact } from '../../lib/core/sync/framedSyncNodeReadingFact.js';
import { selectFramedSyncObjectStateFact } from '../../lib/core/sync/framedSyncObjectStateFact.js';
import { publishFramedSyncOutboundWithDbPort } from '../../lib/core/sync/framedSyncOutboundStaging.js';
import { selectFramedSyncRelationReviewFactsWithDbPort } from '../../lib/core/sync/framedSyncRelationReviewSelection.js';
import {
  type OutboundPublishInput
} from '../../lib/core/sync/framedSyncStagingContract.js';
import { assertSyncGroupLocalPublicationAllowed } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { isNodeVersionIdentityOnly } from '../../lib/core/sync/syncNodeVersionHistory.js';
import { streamRetainedNodeVersions } from '../../lib/core/sync/syncNodeVersionSelection.js';
import { projectDesktopFramedSyncNodeRecord } from '../sync/desktopFramedSyncNodeProjection.js';

type InventoryKey = Readonly<{ globalId: string; objectType: string }>;

export type DesktopFramedSyncOutboundResult =
  | Readonly<{ deferredObjects: readonly FramedSyncDeferredObject[]; kind: 'deferred' }>
  | Readonly<{
    deferredObjects: readonly [];
    kind: 'published';
    publication: OutboundPublishInput;
    stagingResult: 'created' | 'identical';
  }>;

export type DesktopFramedSyncOutboundInput = Readonly<{
  context: FramedSyncContext;
  difference: FramedSyncInventoryDifference;
  port: DbPort;
  readCurrentInventoryEntry: (
    tx: DbPort,
    key: InventoryKey
  ) => Promise<FramedSyncInventoryEntry | null>;
}>;

function sameBlob(left: CanonicalBlob, right: CanonicalBlob) {
  return left.byteLength === right.byteLength && left.required === right.required &&
    left.role === right.role && bytesToHex(left.sha256) === bytesToHex(right.sha256);
}

export async function selectDesktopFramedSyncNodeManifest(
  tx: DbPort,
  difference: FramedSyncInventoryDifference
): Promise<CanonicalManifest> {
  if (difference.direction !== 'local_to_remote') {
    throw new Error('framed_sync_outbound_node_difference_invalid');
  }
  if (difference.objectType !== 'node') {
    const facts = await Promise.all((difference.need.stateFactIds?.length ? difference.need.stateFactIds :
      difference.sourceSnapshot.stateFactIds ?? []).map((factId) =>
      selectFramedSyncObjectStateFact(tx, difference, factId)));
    for (const fact of facts) for (const blob of fact.blobs) {
      if (blob.role !== 5) continue;
      await stageFramedSyncFrozenBody(tx, blob, await loadFramedExternalDocumentBody(tx, fact.globalId, blob));
    }
    return { blobs: facts.flatMap((fact) => fact.blobs), facts };
  }
  const versionIds = requiredFramedSyncNodeVersionIds(difference);
  const projections = await selectContinuousNodeProjections(tx, versionIds, difference.globalId);
  const related = await selectFramedSyncRelationReviewFactsWithDbPort(tx, difference);
  if (related.kind === 'deferred') throw new Error('framed_sync_source_changed');
  const stateFacts = await Promise.all((difference.need.stateFactIds ?? []).map((factId) =>
    selectFramedSyncNodeReadingFact(tx, difference.globalId, factId)));
  const blobs = new Map<string, CanonicalBlob>();
  for (const projection of projections) for (const blob of projection.manifest.blobs) {
    const key = bytesToHex(blob.sha256);
    const prior = blobs.get(key);
    if (prior && !sameBlob(prior, blob)) throw new Error('framed_sync_outbound_blob_identity_conflict');
    blobs.set(key, blob);
  }
  const facts = [
    ...projections.flatMap((value) => value.manifest.facts),
    ...stateFacts,
    ...related.facts
  ];
  if (!facts.length) throw new Error('framed_sync_outbound_fact_set_empty');
  return { blobs: [...blobs.values()], facts };
}

async function selectContinuousNodeProjections(tx: DbPort, versionIds: readonly string[], globalId: string) {
  const projections: { manifest: CanonicalManifest }[] = [];
  for await (const record of streamRetainedNodeVersions(tx, versionIds, globalId)) {
    if (isNodeVersionIdentityOnly(record)) {
      projections.push({ manifest: { blobs: [], facts: [projectFramedSyncNodeIdentityFact(record)] } });
      continue;
    }
    const projection = projectDesktopFramedSyncNodeRecord(record);
    const blob = projection.manifest.blobs.find((value) => value.role === 1);
    if (!blob) throw new Error('framed_sync_body_descriptor_missing');
    await stageFramedSyncFrozenBody(tx, blob, projection.bodyBlob);
    for (const alternative of projection.alternativeBodyBlobs ?? []) {
      await stageFramedSyncFrozenBody(tx, alternative.blob, alternative.data);
    }
    projections.push({ manifest: projection.manifest });
  }
  return projections;
}

export async function publishDesktopFramedSyncNodeOutbound(
  input: DesktopFramedSyncOutboundInput
): Promise<DesktopFramedSyncOutboundResult> {
  return input.port.transaction(async (tx) => {
    await assertSyncGroupLocalPublicationAllowed(tx);
    const difference = input.difference;
    if (difference.direction !== 'local_to_remote') {
      throw new Error('framed_sync_outbound_direction_invalid');
    }
    const current = await input.readCurrentInventoryEntry(tx, difference);
    const validation = revalidateFramedSyncInventorySource({
      currentSource: current ? [current] : [],
      differences: [difference],
      direction: 'local_to_remote'
    });
    if (validation.deferredObjects.length) {
      return { deferredObjects: validation.deferredObjects, kind: 'deferred' };
    }
    if (difference.objectType === 'node' && current && current.resourceHashes.length === 0 &&
        requiredFramedSyncNodeVersionIds(difference).length > 0) {
      return { deferredObjects: [{ globalId: difference.globalId, objectType: 'node' }],
        kind: 'deferred' };
    }
    const manifest = await selectDesktopFramedSyncNodeManifest(tx, difference);
    const contentId = await canonicalContentId(manifest);
    const transferId = await canonicalTransferId(input.context, contentId);
    const publishedHashes = new Set(manifest.blobs.map((blob) => bytesToHex(blob.sha256)));
    const publication: OutboundPublishInput = {
      contentId,
      inventoryDifference: { ...difference, need: { ...difference.need,
        resourceHashes: difference.need.resourceHashes.filter((hash) => publishedHashes.has(bytesToHex(hash))) } },
      context: input.context,
      manifest,
      manifestHash: contentId.slice(),
      transferId
    };
    const stagingResult = await publishFramedSyncOutboundWithDbPort(tx, publication);
    return { deferredObjects: [], kind: 'published', publication, stagingResult };
  });
}
