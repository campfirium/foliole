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
import { selectFramedSyncNodeReadingFact } from '../../../../../../lib/core/sync/framedSyncNodeReadingFact.js';
import {
  createFramedSyncNodeResourceBlob,
  readFramedSyncNodeResources
} from '../../../../../../lib/core/sync/framedSyncNodeResources.js';
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

function resourceFiles(value: unknown) {
  if (value === undefined) return new Map<string, bigint>();
  if (!Array.isArray(value)) throw new Error('framed_sync_outbound_resource_files_invalid');
  const result = new Map<string, bigint>();
  for (const item of value) {
    if (!item || typeof item !== 'object') throw new Error('framed_sync_outbound_resource_files_invalid');
    const row = item as Record<string, unknown>;
    const storageKey = requiredText(row.storage_key);
    const lengthText = requiredText(row.byte_length);
    if (!/^(0|[1-9][0-9]*)$/u.test(lengthText) || result.has(storageKey)) {
      throw new Error('framed_sync_outbound_resource_files_invalid');
    }
    result.set(storageKey, BigInt(lengthText));
  }
  return result;
}

async function selectOutbound(db: DbPort, payload: Record<string, unknown>) {
  const objectId = requiredText(payload.object_id);
  const includeCurrentNode = requiredBoolean(payload.include_current_node);
  const requiredRelationIds = requiredStrings(payload.required_relation_ids, 'relation_ids');
  const reviewFactIds = requiredStrings(payload.review_fact_ids, 'review_fact_ids');
  const stateFactIds = requiredStrings(payload.state_fact_ids, 'state_fact_ids');
  const current = await readFramedSyncInventoryEntry(db, { globalId: objectId, objectType: 'node' });
  if (!current) throw new Error('framed_sync_source_empty');
  const difference: FramedSyncInventoryDifference = {
    direction: 'local_to_remote', globalId: objectId, objectType: 'node', sourceSnapshot: current,
    need: { frontierFactIds: includeCurrentNode ? current.frontierFactIds : [],
      requiredRelationIds, resourceHashes: includeCurrentNode ? current.resourceHashes : [],
      reviewFactIds, stateFactIds, sharedState: includeCurrentNode }
  };
  const selected = await selectFramedSyncRelationReviewFactsWithDbPort(db, difference);
  if (selected.kind === 'deferred') throw new Error('framed_sync_source_changed');
  const versionIds = requiredFramedSyncNodeVersionIds(difference);
  const records = await loadStoredSyncNodeVersionRecords(db, versionIds);
  const selectedRecords = versionIds.map((versionId) => {
    const record = records.get(versionId);
    if (!record || record.object_id !== objectId) {
      throw new Error(`framed_sync_outbound_node_fact_unavailable:${versionId}`);
    }
    return record;
  });
  const stateFacts = await Promise.all(stateFactIds.map((factId) =>
    selectFramedSyncNodeReadingFact(db, objectId, factId)));
  return { records: orderNodeVersionHistory(selectedRecords), selected, stateFacts };
}

export async function inspectCompanionFramedSyncOutbound(
  db: DbPort,
  payload: Record<string, unknown>
) {
  const selection = await selectOutbound(db, payload);
  const keys = new Set(selection.records.flatMap((record) =>
    readFramedSyncNodeResources(record.snapshot.resource_references).map((resource) => resource.storageKey)));
  return { resource_storage_keys: [...keys].sort() };
}

/** Freeze one current node version and return the host-neutral bytes needed by a native sender. */
export async function prepareCompanionFramedSyncOutbound(
  db: DbPort,
  payload: Record<string, unknown>
) {
  return db.transaction(async (tx) => {
    const selection = await selectOutbound(tx, payload);
    const suppliedResources = resourceFiles(payload.resource_files);
    const consumedResources = new Set<string>();
    const projections = selection.records.map((record) => {
      const resources = readFramedSyncNodeResources(record.snapshot.resource_references).map((resource) => {
        const length = suppliedResources.get(resource.storageKey);
        if (length === undefined) throw new Error('framed_sync_outbound_resource_unavailable');
        consumedResources.add(resource.storageKey);
        return { ...resource, blob: createFramedSyncNodeResourceBlob(resource, length) };
      });
      return { projection: projectFramedSyncNodeRecord(record, resources.map((value) => value.blob)),
        record, resources };
    });
    if (consumedResources.size !== suppliedResources.size) {
      throw new Error('framed_sync_outbound_resource_files_mismatch');
    }
    const blobs = new Map<string, { blob: CanonicalBlob; dataText?: string; storageKey?: string }>();
    for (const { projection, record } of projections) for (const blob of projection.manifest.blobs) {
      const key = bytesToHex(blob.sha256);
      const prior = blobs.get(key);
      if (prior && !sameBlob(prior.blob, blob)) {
        throw new Error('framed_sync_outbound_blob_identity_conflict');
      }
      if (blob.role === 1) blobs.set(key, { blob, dataText: record.body_text ?? '' });
    }
    for (const { resources } of projections) for (const resource of resources) {
      const key = bytesToHex(resource.blob.sha256);
      const prior = blobs.get(key);
      if (prior && !sameBlob(prior.blob, resource.blob)) {
        throw new Error('framed_sync_outbound_blob_identity_conflict');
      }
      blobs.set(key, { blob: resource.blob, storageKey: resource.storageKey });
    }
    const manifest = { blobs: [...blobs.values()].map((value) => value.blob),
      facts: [...projections.flatMap((value) => value.projection.manifest.facts),
        ...selection.selected.facts, ...selection.stateFacts] };
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
