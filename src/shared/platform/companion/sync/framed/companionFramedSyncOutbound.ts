import { bytesToHex } from '@noble/hashes/utils.js';

import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import {
  canonicalContentId,
  canonicalTransferId,
  type CanonicalBlob
} from '../../../../../../lib/core/sync/framedSyncCanonicalManifest.js';
import { createCompanionFramedSyncOutboundValue } from '../../../../../../lib/core/sync/framedSyncCompanionOutboundContract.js';
import { FRAMED_SYNC_PROTOCOL_VERSION, type FramedSyncContext } from '../../../../../../lib/core/sync/framedSyncContract.js';
import {
  requiredFramedSyncNodeVersionIds,
  type FramedSyncInventoryDifference
} from '../../../../../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventoryEntry } from '../../../../../../lib/core/sync/framedSyncInventoryRead.js';
import { projectFramedSyncNodeRecord } from '../../../../../../lib/core/sync/framedSyncNodeProjection.js';
import { publishFramedSyncOutboundWithDbPort } from '../../../../../../lib/core/sync/framedSyncOutboundStaging.js';
import { encodeValidatedProtocolMessage } from '../../../../../../lib/core/sync/framedSyncProtocolCodec.js';
import { selectFramedSyncRelationReviewFactsWithDbPort } from '../../../../../../lib/core/sync/framedSyncRelationReviewSelection.js';
import { factToWire } from '../../../../../../lib/core/sync/framedSyncWireProjection.js';
import { loadStoredSyncNodeVersionRecords } from '../../../../../../lib/core/sync/syncNodeGraph.js';
import { orderNodeVersionHistory } from '../../../../../../lib/core/sync/syncNodeVersionHistory.js';

function sameBlob(left: CanonicalBlob, right: CanonicalBlob) {
  return left.byteLength === right.byteLength && left.required === right.required &&
    left.role === right.role && bytesToHex(left.sha256) === bytesToHex(right.sha256);
}

function requiredText(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('sync_group_data_text_required');
  return value.trim();
}

function requiredStrings(value: unknown, name: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item)) {
    throw new Error(`sync_group_data_${name}_invalid`);
  }
  return value as string[];
}

function requiredBoolean(value: unknown) {
  if (typeof value !== 'boolean') throw new Error('sync_group_data_boolean_required');
  return value;
}

function context(payload: Record<string, unknown>): FramedSyncContext {
  return {
    groupId: requiredText(payload.group_id),
    protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    receiverDeviceId: requiredText(payload.receiver_device_id),
    receiverLibraryEpoch: requiredText(payload.receiver_library_epoch),
    senderDeviceId: requiredText(payload.sender_device_id),
    senderLibraryEpoch: requiredText(payload.sender_library_epoch)
  };
}

/** Freeze one current node version and return the host-neutral bytes needed by a native sender. */
export async function prepareCompanionFramedSyncOutbound(
  db: DbPort,
  payload: Record<string, unknown>
) {
  return db.transaction(async (tx) => {
    const objectId = requiredText(payload.object_id);
    const includeCurrentNode = requiredBoolean(payload.include_current_node);
    const requiredRelationIds = requiredStrings(payload.required_relation_ids, 'relation_ids');
    const reviewFactIds = requiredStrings(payload.review_fact_ids, 'review_fact_ids');
    const current = await readFramedSyncInventoryEntry(tx, { globalId: objectId, objectType: 'node' });
    if (!current) throw new Error('framed_sync_source_empty');
    const difference: FramedSyncInventoryDifference = {
      direction: 'local_to_remote', globalId: objectId, objectType: 'node', sourceSnapshot: current,
      need: { frontierFactIds: includeCurrentNode ? current.frontierFactIds : [],
        requiredRelationIds, resourceHashes: includeCurrentNode ? current.resourceHashes : [],
        reviewFactIds, sharedState: includeCurrentNode }
    };
    const selected = await selectFramedSyncRelationReviewFactsWithDbPort(tx, difference);
    if (selected.kind === 'deferred') throw new Error('framed_sync_source_changed');
    const versionIds = requiredFramedSyncNodeVersionIds(difference);
    const records = await loadStoredSyncNodeVersionRecords(tx, versionIds);
    const selectedRecords = versionIds.map((versionId) => {
      const record = records.get(versionId);
      if (!record || record.object_id !== objectId) {
        throw new Error(`framed_sync_outbound_node_fact_unavailable:${versionId}`);
      }
      return record;
    });
    const projections = orderNodeVersionHistory(selectedRecords).map((record) => ({
      projection: projectFramedSyncNodeRecord(record), record
    }));
    const blobs = new Map<string, { blob: CanonicalBlob; dataText: string }>();
    for (const { projection, record } of projections) for (const blob of projection.manifest.blobs) {
      const key = bytesToHex(blob.sha256);
      const prior = blobs.get(key);
      if (prior && !sameBlob(prior.blob, blob)) {
        throw new Error('framed_sync_outbound_blob_identity_conflict');
      }
      blobs.set(key, { blob, dataText: record.body_text ?? '' });
    }
    const manifest = { blobs: [...blobs.values()].map((value) => value.blob),
      facts: [...projections.flatMap((value) => value.projection.manifest.facts), ...selected.facts] };
    if (!manifest.facts.length) throw new Error('framed_sync_outbound_fact_set_empty');
    const transferContext = context(payload);
    const contentId = await canonicalContentId(manifest);
    const transferId = await canonicalTransferId(transferContext, contentId);
    const state = await publishFramedSyncOutboundWithDbPort(tx, {
      contentId, context: transferContext, manifest, manifestHash: contentId, transferId
    });
    return createCompanionFramedSyncOutboundValue({
      blobs: [...blobs.values()],
      contentId,
      factMessageBytesList: manifest.facts.map((fact) =>
        encodeValidatedProtocolMessage('fact', factToWire(fact))),
      manifestHash: contentId, publicationState: state, transferId
    });
  });
}
