import { bytesToHex } from '@noble/hashes/utils.js';

import { adoptVerifiedBody } from '../../../../../../lib/core/sync/bodyContentWrite.js';
import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import { canonicalContentId, canonicalTransferId, type CanonicalBlob } from '../../../../../../lib/core/sync/framedSyncCanonicalManifest.js';
import { createCompanionFramedSyncOutboundValue } from '../../../../../../lib/core/sync/framedSyncCompanionOutboundContract.js';
import { projectVerifiedFramedSyncNode } from '../../../../../../lib/core/sync/framedSyncNodeProjection.js';
import { createFramedSyncNodeResourceBlob, readFramedSyncNodeResources } from '../../../../../../lib/core/sync/framedSyncNodeResources.js';
import { publishFramedSyncOutboundWithDbPort } from '../../../../../../lib/core/sync/framedSyncOutboundStaging.js';
import { encodeValidatedProtocolMessage } from '../../../../../../lib/core/sync/framedSyncProtocolCodec.js';
import { loadFramedSyncPublishedOutboundValue } from '../../../../../../lib/core/sync/framedSyncPublishedOutboundValue.js';
import { loadVerifiedFramedOutboundNodes, normalizeVerifiedOutboundTombstone } from '../../../../../../lib/core/sync/framedSyncVerifiedOutboundNodeFacts.js';
import { factToWire } from '../../../../../../lib/core/sync/framedSyncWireProjection.js';
import { assertSyncGroupLocalPublicationAllowed } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { loadVerifiedBodyRef, type VerifiedBodyRef } from '../../../../../../lib/core/sync/verifiedBody.js';

import { context, requiredText, resourceFiles, selectOutboundFacts } from './companionFramedSyncOutboundSelection.js';

type BlobSource = { blob: CanonicalBlob; bodyRef?: VerifiedBodyRef; storageKey?: string };

async function selection(db: DbPort, payload: Record<string, unknown>) {
  return selectOutboundFacts(db, payload, 'chunked', (ids, objectId) => loadVerifiedFramedOutboundNodes(db, ids, objectId));
}

export async function inspectVerifiedCompanionFramedSyncOutbound(db: DbPort, payload: Record<string, unknown>) {
  if (payload.transfer_id !== undefined) {
    const value = await loadFramedSyncPublishedOutboundValue(db, context(payload), requiredText(payload.transfer_id), 'chunked');
    return { resource_storage_keys: value.blobs.flatMap((blob) => blob.storage_key === undefined ? [] : [blob.storage_key]) };
  }
  const selected = await selection(db, payload);
  const keys = new Set(selected.nodes.filter((node) => node.metadata.is_tombstone || node.body.kind !== 'retired')
    .flatMap((node) => readFramedSyncNodeResources(node.metadata.snapshot.resource_references).map((resource) => resource.storageKey)));
  return { resource_storage_keys: [...keys].sort() };
}

/** Explicit candidate; native senders must consume verified_chunks before this becomes their production input. */
export async function prepareVerifiedCompanionFramedSyncOutbound(db: DbPort, payload: Record<string, unknown>) {
  return db.transaction(async (tx) => {
    await assertSyncGroupLocalPublicationAllowed(tx);
    if (payload.transfer_id !== undefined) return loadFramedSyncPublishedOutboundValue(
      tx, context(payload), requiredText(payload.transfer_id), 'chunked');
    const selected = await selection(tx, payload);
    const supplied = resourceFiles(payload.resource_files), consumed = new Set<string>();
    const sources = new Map<string, BlobSource>();
    const resourceSources: BlobSource[] = [];
    const facts = [];
    for (const source of selected.nodes) {
      const node = await normalizeVerifiedOutboundTombstone(tx, source);
      const resources = node.body.kind === 'retired' ? [] : readFramedSyncNodeResources(node.metadata.snapshot.resource_references);
      const resourceBlobs = resources.map((resource) => {
        const length = supplied.get(resource.storageKey);
        if (length === undefined) throw new Error('framed_sync_outbound_resource_unavailable');
        consumed.add(resource.storageKey);
        return { blob: createFramedSyncNodeResourceBlob(resource, length), storageKey: resource.storageKey };
      });
      const fact = projectVerifiedFramedSyncNode(node, resourceBlobs.map((resource) => resource.blob));
      facts.push(fact);
      if (node.body.kind === 'readable') {
        const refs = new Map([node.body.ref, ...node.alternativeBodies].map((ref) => [ref.hash, ref]));
        for (const blob of fact.blobs.filter((blob) => blob.role === 1)) addSource(sources, { blob, bodyRef: refs.get(bytesToHex(blob.sha256))! });
      }
      resourceSources.push(...resourceBlobs);
    }
    if (consumed.size !== supplied.size) throw new Error('framed_sync_outbound_resource_files_mismatch');
    resourceSources.forEach((resource) => addSource(sources, resource));
    for (const fact of selected.stateFacts) for (const blob of fact.blobs) {
      const ref = await loadVerifiedBodyRef(tx, bytesToHex(blob.sha256));
      if (!ref || BigInt(ref.byteLength) !== blob.byteLength) throw new Error('framed_sync_external_document_body_invalid');
      sources.set(ref.hash, { blob, bodyRef: ref });
    }
    const manifest = { blobs: [...sources.values()].map((source) => source.blob),
      facts: [...facts, ...selected.selected.facts, ...selected.stateFacts] };
    if (!manifest.facts.length) throw new Error('framed_sync_outbound_fact_set_empty');
    for (const source of sources.values()) if (source.bodyRef) await adoptVerifiedBody(tx, source.bodyRef, new Date().toISOString());
    const transferContext = context(payload), contentId = await canonicalContentId(manifest);
    const transferId = await canonicalTransferId(transferContext, contentId);
    const publicationState = await publishFramedSyncOutboundWithDbPort(tx, {
      contentId, context: transferContext, inventoryDifference: selected.difference, manifest, manifestHash: contentId, transferId
    });
    return createCompanionFramedSyncOutboundValue({ blobs: [...sources.values()], contentId,
      factMessageBytesList: manifest.facts.map((fact) => encodeValidatedProtocolMessage('fact', factToWire(fact))),
      manifestHash: contentId, publicationState, transferId });
  });
}

function addSource(sources: Map<string, BlobSource>, source: BlobSource) {
  const hash = bytesToHex(source.blob.sha256), prior = sources.get(hash);
  if (prior && (prior.blob.byteLength !== source.blob.byteLength || prior.blob.required !== source.blob.required || prior.blob.role !== source.blob.role)) {
    throw new Error('framed_sync_outbound_blob_identity_conflict');
  }
  sources.set(hash, source);
}
