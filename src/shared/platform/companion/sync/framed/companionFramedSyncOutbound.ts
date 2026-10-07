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
import type { FramedSyncContext } from '../../../../../../lib/core/sync/framedSyncContract.js';
import type { FramedSyncInventoryDifference } from '../../../../../../lib/core/sync/framedSyncInventory.js';
import { projectFramedSyncNodeIdentityFact, projectFramedSyncNodeRecord } from '../../../../../../lib/core/sync/framedSyncNodeProjection.js';
import {
  createFramedSyncNodeResourceBlob,
  readFramedSyncNodeResources
} from '../../../../../../lib/core/sync/framedSyncNodeResources.js';
import { publishFramedSyncOutboundWithDbPort } from '../../../../../../lib/core/sync/framedSyncOutboundStaging.js';
import { encodeValidatedProtocolMessage } from '../../../../../../lib/core/sync/framedSyncProtocolCodec.js';
import { loadFramedSyncPublishedOutboundValue } from '../../../../../../lib/core/sync/framedSyncPublishedOutboundValue.js';
import { factToWire } from '../../../../../../lib/core/sync/framedSyncWireProjection.js';
import { assertSyncGroupLocalPublicationAllowed } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { loadRetainedSyncNodeVersionRecords } from '../../../../../../lib/core/sync/syncNodeGraph.js';
import { upsertTextBodyBlob } from '../../../../../../lib/core/sync/syncNodeTextBodyBlobs.js';
import type { NodeVersionBodyStorage } from '../../../../../../lib/core/sync/syncNodeTombstoneVersion.js';
import { isNodeVersionIdentityOnly, orderNodeVersionHistory } from '../../../../../../lib/core/sync/syncNodeVersionHistory.js';

import { context, requiredText, resourceFiles, selectOutboundFacts } from './companionFramedSyncOutboundSelection.js';
import { inspectVerifiedCompanionFramedSyncOutbound, prepareVerifiedCompanionFramedSyncOutbound } from './companionFramedSyncVerifiedOutbound.js';

function sameBlob(left: CanonicalBlob, right: CanonicalBlob) {
  return left.byteLength === right.byteLength && left.required === right.required &&
    left.role === right.role && bytesToHex(left.sha256) === bytesToHex(right.sha256);
}

async function selectOutbound(db: DbPort, payload: Record<string, unknown>) {
  const selection = await selectOutboundFacts(db, payload, 'continuous', async (versionIds, objectId) => {
    const records = await loadRetainedSyncNodeVersionRecords(db, versionIds);
    const selected = versionIds.map((versionId) => {
      const record = records.get(versionId);
      if (!record || record.object_id !== objectId) throw new Error(`framed_sync_outbound_node_fact_unavailable:${versionId}`);
      return record;
    });
    return selected;
  });
  return { ...selection, records: orderNodeVersionHistory(selection.nodes) };
}

export async function inspectCompanionFramedSyncOutbound(
  db: DbPort,
  payload: Record<string, unknown>,
  bodyStorage: NodeVersionBodyStorage = 'continuous'
) {
  if (bodyStorage === 'chunked') return inspectVerifiedCompanionFramedSyncOutbound(db, payload);
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
  payload: Record<string, unknown>,
  bodyStorage: NodeVersionBodyStorage = 'continuous'
) {
  if (bodyStorage === 'chunked') return prepareVerifiedCompanionFramedSyncOutbound(db, payload);
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
