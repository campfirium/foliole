import { bytesToHex } from '@noble/hashes/utils.js';

import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import { isFramedSyncPublicationBatchReady } from '../../../../../../lib/core/sync/framedSyncBatchReadiness.js';
import {
  canonicalContentId,
  canonicalTransferId,
  type CanonicalBlob,
  type CanonicalFact,
  type CanonicalManifest
} from '../../../../../../lib/core/sync/framedSyncCanonicalManifest.js';
import { createCompanionFramedSyncOutboundValue } from '../../../../../../lib/core/sync/framedSyncCompanionOutboundContract.js';
import type { FramedSyncContext } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { loadFramedExternalDocumentBody } from '../../../../../../lib/core/sync/framedSyncExternalDocumentBody.js';
import { stageFramedSyncFrozenBody } from '../../../../../../lib/core/sync/framedSyncFrozenBody.js';
import type { FramedSyncInventoryDifference } from '../../../../../../lib/core/sync/framedSyncInventory.js';
import { projectFramedSyncNodeIdentityFact, projectFramedSyncNodeRecord } from '../../../../../../lib/core/sync/framedSyncNodeProjection.js';
import { publishFramedSyncOutboundWithDbPort } from '../../../../../../lib/core/sync/framedSyncOutboundStaging.js';
import { encodeValidatedProtocolMessage } from '../../../../../../lib/core/sync/framedSyncProtocolCodec.js';
import { inspectFramedSyncPublishedReceipt } from '../../../../../../lib/core/sync/framedSyncPublishedManifest.js';
import { loadFramedSyncPublishedOutboundValue } from '../../../../../../lib/core/sync/framedSyncPublishedOutboundValue.js';
import { manifestToWire } from '../../../../../../lib/core/sync/framedSyncWireProjection.js';
import { assertSyncGroupLocalPublicationAllowed } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { isNodeVersionIdentityOnly } from '../../../../../../lib/core/sync/syncNodeVersionHistory.js';
import { selectRetainedNodeVersionOrder, streamRetainedNodeVersions } from '../../../../../../lib/core/sync/syncNodeVersionSelection.js';

import { publishCompanionFramedSyncRequestedResources, readCompanionFramedSyncOutboundRequest,
  resolveCompanionFramedSyncOutboundRequest } from './companionFramedSyncOutboundRequest.js';
import { context, requiredText, selectOutboundFacts } from './companionFramedSyncOutboundSelection.js';

function sameBlob(left: CanonicalBlob, right: CanonicalBlob) {
  return left.byteLength === right.byteLength && left.required === right.required &&
    left.role === right.role && bytesToHex(left.sha256) === bytesToHex(right.sha256);
}

async function selectOutbound(db: DbPort, payload: Record<string, unknown>) {
  const selection = payload.difference_request_hex === undefined ? payload :
    await resolveCompanionFramedSyncOutboundRequest(db, payload);
  return selectOutboundFacts(db, selection, (versionIds, objectId) =>
    selectRetainedNodeVersionOrder(db, versionIds, objectId));
}

export async function inspectCompanionFramedSyncOutbound(
  db: DbPort,
  payload: Record<string, unknown>
) {
  if (payload.transfer_id !== undefined) {
    if (payload.receipt_only === true) return inspectFramedSyncPublishedReceipt(
      db, context(payload), requiredText(payload.transfer_id));
    const published = await loadFramedSyncPublishedOutboundValue(
      db, context(payload), requiredText(payload.transfer_id));
    return { resource_storage_keys: published.blobs.flatMap((blob) => blob.storage_key ? [blob.storage_key] : []) };
  }
  if (payload.difference_request_hex !== undefined) {
    const request = readCompanionFramedSyncOutboundRequest(payload);
    if (request.resources.length) return {
      resource_storage_keys: [...new Set(request.resources.map((resource) => resource.storageKey))]
    };
  }
  await selectOutbound(db, payload);
  return { resource_storage_keys: [] };
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
    if (payload.difference_request_hex !== undefined && readCompanionFramedSyncOutboundRequest(payload).resources.length) {
      const { publication, state } = await publishCompanionFramedSyncRequestedResources(tx, payload);
      const value = await loadFramedSyncPublishedOutboundValue(tx, context(payload), bytesToHex(publication.transferId));
      return { ...value, publication_state: state };
    }
    const selection = await selectOutbound(tx, payload);
    const projections: { manifest: CanonicalManifest }[] = [];
    const blobs = new Map<string, { blob: CanonicalBlob; frozenBody: boolean }>();
    const ids = selection.nodes.map((node) => node.version_id);
    for await (const record of streamRetainedNodeVersions(tx, ids, selection.difference.globalId)) {
      const projection = isNodeVersionIdentityOnly(record)
        ? { manifest: { blobs: [], facts: [projectFramedSyncNodeIdentityFact(record)] } }
        : projectFramedSyncNodeRecord(record, []);
      projections.push({ manifest: projection.manifest });
      for (const blob of projection.manifest.blobs) {
        const key = bytesToHex(blob.sha256);
        const prior = blobs.get(key);
        if (prior && !sameBlob(prior.blob, blob)) throw new Error('framed_sync_outbound_blob_identity_conflict');
        const alternative = record.alternative_bodies?.find((value) => value.hash === key);
        const text = alternative?.text ?? record.body_text ?? '';
        await stageFramedSyncFrozenBody(tx, blob, new TextEncoder().encode(text));
        blobs.set(key, { blob, frozenBody: true });
      }
    }
    await addStateBodies(tx, selection.stateFacts, blobs);
    const manifest = { blobs: [...blobs.values()].map((value) => value.blob),
      facts: [...projections.flatMap((value) => value.manifest.facts),
        ...selection.selected.facts, ...selection.stateFacts] };
    if (!manifest.facts.length) throw new Error('framed_sync_outbound_fact_set_empty');
    return publishSelection(tx, context(payload), manifest, [...blobs.values()], selection.difference);
  });
}

async function addStateBodies(db: DbPort, facts: readonly CanonicalFact[],
  blobs: Map<string, { blob: CanonicalBlob; frozenBody: boolean }>) {
  for (const fact of facts) for (const blob of fact.blobs) {
    await stageFramedSyncFrozenBody(db, blob, await loadFramedExternalDocumentBody(db, fact.globalId, blob));
    blobs.set(bytesToHex(blob.sha256), { blob, frozenBody: true });
  }
}

async function publishSelection(db: DbPort, transferContext: FramedSyncContext, manifest: CanonicalManifest,
  blobs: readonly { blob: CanonicalBlob; frozenBody: boolean }[],
  inventoryDifference: FramedSyncInventoryDifference) {
  const contentId = await canonicalContentId(manifest);
  const transferId = await canonicalTransferId(transferContext, contentId);
  const state = await publishFramedSyncOutboundWithDbPort(db, {
    contentId, context: transferContext, inventoryDifference, manifest, manifestHash: contentId, transferId
  });
  return createCompanionFramedSyncOutboundValue({ blobs, contentId,
    batchReady: isFramedSyncPublicationBatchReady({ manifest }),
    headerMessageBytes: encodeValidatedProtocolMessage('transfer_header', {
      attemptId: new Uint8Array(16), manifest: manifestToWire(manifest, transferContext.groupId, contentId), transferId
    }), manifestHash: contentId, publicationState: state, transferId });
}
