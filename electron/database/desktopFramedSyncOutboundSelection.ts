import { bytesToHex } from '@noble/hashes/utils.js';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import {
  canonicalContentId,
  canonicalTransferId,
  type CanonicalBlob,
  type CanonicalManifest
} from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import type { FramedSyncContext } from '../../lib/core/sync/framedSyncContract.js';
import {
  revalidateFramedSyncInventorySource,
  requiredFramedSyncNodeVersionIds,
  type FramedSyncDeferredObject,
  type FramedSyncInventoryDifference,
  type FramedSyncInventoryEntry
} from '../../lib/core/sync/framedSyncInventory.js';
import { selectFramedSyncRelationReviewFactsWithDbPort } from '../../lib/core/sync/framedSyncRelationReviewSelection.js';
import {
  assertOutboundPublication,
  type OutboundPublishInput
} from '../../lib/core/sync/framedSyncStagingContract.js';
import { loadStoredSyncNodeVersionRecords } from '../../lib/core/sync/syncNodeGraph.js';
import { orderNodeVersionHistory } from '../../lib/core/sync/syncNodeVersionHistory.js';
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

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function encodeManifest(manifest: CanonicalManifest) {
  return JSON.stringify(manifest, (_key, value: unknown) => {
    if (typeof value === 'bigint') return value.toString();
    return value instanceof Uint8Array ? [...value] : value;
  });
}

async function stagePublication(tx: DbPort, input: OutboundPublishInput) {
  const verified = await assertOutboundPublication(input);
  const [prior] = await tx.query<{ canonical_manifest: Uint8Array; content_id: Uint8Array }>(
    'SELECT content_id, canonical_manifest FROM framed_sync_outbound_publications WHERE transfer_id = ?',
    [input.transferId]
  );
  if (prior) {
    if (sameBytes(prior.content_id, input.contentId) &&
        sameBytes(prior.canonical_manifest, verified.canonicalBytes)) return 'identical' as const;
    throw new Error('outbound_publication_conflict');
  }
  const context = input.context;
  await tx.run(`INSERT INTO framed_sync_outbound_publications VALUES
    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')`, [input.transferId,
    input.contentId, input.manifestHash, verified.canonicalBytes, encodeManifest(input.manifest),
    context.protocolVersion, context.groupId, context.senderDeviceId, context.senderLibraryEpoch,
    context.receiverDeviceId, context.receiverLibraryEpoch, input.manifest.facts.length,
    input.manifest.blobs.length,
    input.manifest.blobs.reduce((total, blob) => total + blob.byteLength, 0n)]);
  for (const fact of input.manifest.facts) {
    await tx.run('INSERT INTO framed_sync_outbound_fact_refs VALUES (?, ?, ?, ?, ?)',
      [input.transferId, fact.kind, fact.objectType, fact.globalId, fact.factId]);
  }
  for (const blob of input.manifest.blobs) {
    await tx.run('INSERT INTO framed_sync_outbound_blob_refs VALUES (?, ?, ?, ?, ?)',
      [input.transferId, blob.sha256, blob.byteLength, blob.role, blob.required ? 1 : 0]);
  }
  await tx.run('INSERT INTO framed_sync_outbound_holds VALUES (?, ?)',
    [input.transferId, context.receiverDeviceId]);
  return 'created' as const;
}

export async function selectDesktopFramedSyncNodeManifest(
  tx: DbPort,
  difference: FramedSyncInventoryDifference
): Promise<CanonicalManifest> {
  if (difference.direction !== 'local_to_remote' || difference.objectType !== 'node') {
    throw new Error('framed_sync_outbound_node_difference_invalid');
  }
  const versionIds = requiredFramedSyncNodeVersionIds(difference);
  const records = await loadStoredSyncNodeVersionRecords(tx, versionIds);
  const selectedRecords = versionIds.map((versionId) => {
    const record = records.get(versionId);
    if (!record || record.object_id !== difference.globalId) {
      throw new Error(`framed_sync_outbound_node_fact_unavailable:${versionId}`);
    }
    return record;
  });
  const projections = orderNodeVersionHistory(selectedRecords).map(projectDesktopFramedSyncNodeRecord);
  const related = await selectFramedSyncRelationReviewFactsWithDbPort(tx, difference);
  if (related.kind === 'deferred') throw new Error('framed_sync_source_changed');
  const blobs = new Map<string, CanonicalBlob>();
  for (const projection of projections) for (const blob of projection.manifest.blobs) {
    const key = bytesToHex(blob.sha256);
    const prior = blobs.get(key);
    if (prior && !sameBlob(prior, blob)) throw new Error('framed_sync_outbound_blob_identity_conflict');
    blobs.set(key, blob);
  }
  for (const required of difference.need.resourceHashes) {
    if (!blobs.has(bytesToHex(required))) throw new Error('framed_sync_outbound_resource_unavailable');
  }
  const facts = [
    ...projections.flatMap((value) => value.manifest.facts),
    ...related.facts
  ];
  if (!facts.length) throw new Error('framed_sync_outbound_fact_set_empty');
  return { blobs: [...blobs.values()], facts };
}

export async function publishDesktopFramedSyncNodeOutbound(
  input: DesktopFramedSyncOutboundInput
): Promise<DesktopFramedSyncOutboundResult> {
  return input.port.transaction(async (tx) => {
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
    const manifest = await selectDesktopFramedSyncNodeManifest(tx, difference);
    const contentId = await canonicalContentId(manifest);
    const transferId = await canonicalTransferId(input.context, contentId);
    const publication: OutboundPublishInput = {
      contentId,
      context: input.context,
      manifest,
      manifestHash: contentId.slice(),
      transferId
    };
    const stagingResult = await stagePublication(tx, publication);
    return { deferredObjects: [], kind: 'published', publication, stagingResult };
  });
}
