import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import {
  canonicalContentId,
  canonicalTransferId,
  type CanonicalBlob,
  type CanonicalFact,
  type CanonicalManifest
} from '../../../../../../lib/core/sync/framedSyncCanonicalManifest.js';
import { createCompanionFramedSyncOutboundValue } from '../../../../../../lib/core/sync/framedSyncCompanionOutboundContract.js';
import { FRAMED_SYNC_PROTOCOL_VERSION, type FramedSyncContext } from '../../../../../../lib/core/sync/framedSyncContract.js';
import {
  requiredFramedSyncNodeVersionIds,
  type FramedSyncInventoryDifference
} from '../../../../../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventoryEntry } from '../../../../../../lib/core/sync/framedSyncInventoryRead.js';
import { projectFramedSyncNodeIdentityFact, projectFramedSyncNodeRecord } from '../../../../../../lib/core/sync/framedSyncNodeProjection.js';
import { selectFramedSyncNodeReadingFact } from '../../../../../../lib/core/sync/framedSyncNodeReadingFact.js';
import {
  createFramedSyncNodeResourceBlob,
  readFramedSyncNodeResources
} from '../../../../../../lib/core/sync/framedSyncNodeResources.js';
import { selectFramedSyncObjectStateFact } from '../../../../../../lib/core/sync/framedSyncObjectStateFact.js';
import { publishFramedSyncOutboundWithDbPort } from '../../../../../../lib/core/sync/framedSyncOutboundStaging.js';
import { encodeValidatedProtocolMessage } from '../../../../../../lib/core/sync/framedSyncProtocolCodec.js';
import { loadFramedSyncPublishedOutboundValue } from '../../../../../../lib/core/sync/framedSyncPublishedOutboundValue.js';
import { selectFramedSyncRelationReviewFactsWithDbPort } from '../../../../../../lib/core/sync/framedSyncRelationReviewSelection.js';
import { factToWire } from '../../../../../../lib/core/sync/framedSyncWireProjection.js';
import { assertSyncGroupLocalPublicationAllowed } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { loadRetainedSyncNodeVersionRecords } from '../../../../../../lib/core/sync/syncNodeGraph.js';
import { upsertTextBodyBlob } from '../../../../../../lib/core/sync/syncNodeTextBodyBlobs.js';
import { isNodeVersionIdentityOnly, orderNodeVersionHistory } from '../../../../../../lib/core/sync/syncNodeVersionHistory.js';

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
  const objectType = requiredText(payload.object_type);
  const includeCurrentNode = requiredBoolean(payload.include_current_node);
  const requiredRelationIds = requiredStrings(payload.required_relation_ids, 'relation_ids');
  const reviewFactIds = requiredStrings(payload.review_fact_ids, 'review_fact_ids');
  const stateFactIds = requiredStrings(payload.state_fact_ids, 'state_fact_ids');
  const current = await readFramedSyncInventoryEntry(db, { globalId: objectId, objectType });
  if (!current) throw new Error('framed_sync_source_empty');
  const difference: FramedSyncInventoryDifference = {
    direction: 'local_to_remote', globalId: objectId, objectType, sourceSnapshot: current,
    need: { frontierFactIds: includeCurrentNode ? current.frontierFactIds : [],
      requiredRelationIds, resourceHashes: includeCurrentNode ? current.resourceHashes : [],
      reviewFactIds, stateFactIds, sharedState: includeCurrentNode }
  };
  if (objectType !== 'node') {
    const ids = stateFactIds.length ? stateFactIds : current.stateFactIds ?? [];
    const stateFacts = await Promise.all(ids.map((id) => selectFramedSyncObjectStateFact(db, difference, id)));
    return { difference, records: [], selected: { kind: 'selected' as const, facts: [] }, stateFacts };
  }
  const selected = await selectFramedSyncRelationReviewFactsWithDbPort(db, difference);
  if (selected.kind === 'deferred') throw new Error('framed_sync_source_changed');
  const versionIds = requiredFramedSyncNodeVersionIds(difference);
  const records = await loadRetainedSyncNodeVersionRecords(db, versionIds);
  const selectedRecords = versionIds.map((versionId) => {
    const record = records.get(versionId);
    if (!record || record.object_id !== objectId) {
      throw new Error(`framed_sync_outbound_node_fact_unavailable:${versionId}`);
    }
    return record;
  });
  const stateFacts = await Promise.all(stateFactIds.map((factId) =>
    selectFramedSyncNodeReadingFact(db, objectId, factId)));
  return { difference, records: orderNodeVersionHistory(selectedRecords), selected, stateFacts };
}

export async function inspectCompanionFramedSyncOutbound(
  db: DbPort,
  payload: Record<string, unknown>
) {
  if (payload.transfer_id !== undefined) {
    const value = await loadFramedSyncPublishedOutboundValue(
      db, context(payload), requiredText(payload.transfer_id));
    return { resource_storage_keys: value.blobs.flatMap((blob) =>
      blob.storage_key === undefined ? [] : [blob.storage_key]) };
  }
  const selection = await selectOutbound(db, payload);
  const keys = new Set(selection.records.filter((record) => !isNodeVersionIdentityOnly(record)).flatMap((record) =>
    readFramedSyncNodeResources(record.snapshot.resource_references).map((resource) => resource.storageKey)));
  return { resource_storage_keys: [...keys].sort() };
}

/** Freeze one current node version and return the host-neutral bytes needed by a native sender. */
export async function prepareCompanionFramedSyncOutbound(
  db: DbPort,
  payload: Record<string, unknown>
) {
  return db.transaction(async (tx) => {
    await assertSyncGroupLocalPublicationAllowed(tx);
    if (payload.transfer_id !== undefined) return loadFramedSyncPublishedOutboundValue(
      tx, context(payload), requiredText(payload.transfer_id));
    const selection = await selectOutbound(tx, payload);
    const suppliedResources = resourceFiles(payload.resource_files);
    const consumedResources = new Set<string>();
    const projections = selection.records.map((record) => {
      if (isNodeVersionIdentityOnly(record)) return { record, resources: [],
        projection: { manifest: { blobs: [], facts: [projectFramedSyncNodeIdentityFact(record)] } } };
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
      if (blob.role === 1) {
        const alternative = record.alternative_bodies?.find((value) => value.hash === key);
        blobs.set(key, { blob, dataText: alternative?.text ?? record.body_text ?? '' });
      }
    }
    for (const { resources } of projections) for (const resource of resources) {
      const key = bytesToHex(resource.blob.sha256);
      const prior = blobs.get(key);
      if (prior && !sameBlob(prior.blob, resource.blob)) {
        throw new Error('framed_sync_outbound_blob_identity_conflict');
      }
      blobs.set(key, { blob: resource.blob, storageKey: resource.storageKey });
    }
    await addStateBodies(tx, selection.stateFacts, blobs);
    const manifest = { blobs: [...blobs.values()].map((value) => value.blob),
      facts: [...projections.flatMap((value) => value.projection.manifest.facts),
        ...selection.selected.facts, ...selection.stateFacts] };
    if (!manifest.facts.length) throw new Error('framed_sync_outbound_fact_set_empty');
    await persistBodies(tx, blobs);
    return publishSelection(tx, context(payload), manifest, [...blobs.values()], selection.difference);
  });
}

async function persistBodies(db: DbPort, blobs: Map<string, { blob: CanonicalBlob; dataText?: string; storageKey?: string }>) {
  for (const { blob, dataText } of blobs.values()) {
    if (dataText !== undefined) await upsertTextBodyBlob(db, dataText,
      new Date().toISOString(), bytesToHex(blob.sha256));
  }
}

async function addStateBodies(db: DbPort, facts: readonly CanonicalFact[],
  blobs: Map<string, { blob: CanonicalBlob; dataText?: string; storageKey?: string }>) {
  for (const fact of facts) for (const blob of fact.blobs) {
    const [body] = await db.query<{ data_hex: string }>(
      'SELECT hex(data) AS data_hex FROM content_blob_data WHERE hash = ?', [bytesToHex(blob.sha256)]);
    if (!body) throw new Error('framed_sync_external_document_body_invalid');
    blobs.set(bytesToHex(blob.sha256), { blob, dataText: new TextDecoder('utf-8', { fatal: true })
      .decode(hexToBytes(body.data_hex)) });
  }
}

async function publishSelection(db: DbPort, transferContext: FramedSyncContext, manifest: CanonicalManifest,
  blobs: readonly { blob: CanonicalBlob; dataText?: string; storageKey?: string }[],
  inventoryDifference: FramedSyncInventoryDifference) {
  const contentId = await canonicalContentId(manifest);
  const transferId = await canonicalTransferId(transferContext, contentId);
  const state = await publishFramedSyncOutboundWithDbPort(db, {
    contentId, context: transferContext, inventoryDifference, manifest, manifestHash: contentId, transferId
  });
  return createCompanionFramedSyncOutboundValue({ blobs, contentId,
    factMessageBytesList: manifest.facts.map((fact) =>
      encodeValidatedProtocolMessage('fact', factToWire(fact))),
    manifestHash: contentId, publicationState: state, transferId });
}
