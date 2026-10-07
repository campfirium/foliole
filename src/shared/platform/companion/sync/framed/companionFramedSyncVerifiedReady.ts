import { bytesToHex } from '@noble/hashes/utils.js';

import { framedSyncBytes, framedSyncText } from '../../../../../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbPort, DbRow } from '../../../../../../lib/core/sync/dbPort.js';
import type { CanonicalFact } from '../../../../../../lib/core/sync/framedSyncCanonicalManifest.js';
import { restoreFramedSyncNodeReadingFact } from '../../../../../../lib/core/sync/framedSyncNodeReadingFact.js';
import { restoreFramedSyncNodeMetadata } from '../../../../../../lib/core/sync/framedSyncNodeRestore.js';
import { restoreFramedSyncObjectStateFact } from '../../../../../../lib/core/sync/framedSyncObjectStateFact.js';
import { readFramedSyncReadyFactFrames } from '../../../../../../lib/core/sync/framedSyncReadyFactFrames.js';

import type { CompanionFramedSyncApplyInput } from './companionFramedSyncApply.js';
import { blob, sameBlob, uniqueRows, validateResources } from './companionFramedSyncDescriptorValidation.js';
import { STAGING_TABLES } from './companionFramedSyncStagingTables.js';

async function loadReadyIdentity(db: DbPort, input: CompanionFramedSyncApplyInput) {
  const tables = STAGING_TABLES[input.stagingKind];
  const [transfer] = await db.query<DbRow>(`SELECT state, content_id, active_attempt_id,
    sender_device_id, sender_library_epoch, receiver_device_id, receiver_library_epoch
    FROM ${tables.alias}.${tables.prefix}_transfers WHERE transfer_id = ?`, [input.transferId]);
  if (!transfer || framedSyncText(transfer, 'state') !== 'ready_to_apply') {
    throw new Error('framed_sync_transfer_not_ready');
  }
  for (const [field, expected] of [['sender_device_id', input.senderDeviceId],
    ['sender_library_epoch', input.senderLibraryEpoch], ['receiver_device_id', input.receiverDeviceId],
    ['receiver_library_epoch', input.receiverLibraryEpoch]]) {
    if (typeof field !== 'string' || framedSyncText(transfer, field) !== expected) {
      throw new Error('framed_sync_transfer_context_mismatch');
    }
  }
  return transfer;
}

function validateFacts(facts: readonly CanonicalFact[]) {
  if (!facts.length || facts.some((fact) => ![1, 2, 3, 4].includes(fact.kind))) {
    throw new Error('framed_sync_android_fact_set_unsupported');
  }
  const first = facts[0]!;
  if (facts.some((fact) => fact.globalId !== first.globalId || fact.objectType !== first.objectType)) {
    throw new Error('framed_sync_android_fact_identity_mismatch');
  }
  return first;
}

function validateBodies(facts: readonly CanonicalFact[], nodeFacts: readonly CanonicalFact[], bodyRows: DbRow[]) {
  const bodies = uniqueRows(bodyRows);
  const descriptors = (nodeFacts.length ? nodeFacts : facts).flatMap((fact) =>
    fact.blobs.filter((entry) => entry.role === 1 || entry.role === 5));
  if (bodies.size !== new Set(descriptors.map((entry) => bytesToHex(entry.sha256))).size) {
    throw new Error('framed_sync_android_blob_identity_mismatch');
  }
  for (const descriptor of descriptors) {
    const row = bodies.get(bytesToHex(descriptor.sha256));
    if (!row || !sameBlob(descriptor, blob(row))) throw new Error('framed_sync_android_blob_identity_mismatch');
    if (!nodeFacts.length && (descriptor.role !== 5 || !descriptor.required)) {
      throw new Error('framed_sync_external_document_body_invalid');
    }
  }
  return descriptors;
}

/** The caller keeps the attached native ready owner alive through the business transaction. */
export async function loadVerifiedCompanionReady(db: DbPort, input: CompanionFramedSyncApplyInput) {
  const tables = STAGING_TABLES[input.stagingKind];
  const transfer = await loadReadyIdentity(db, input);
  const facts = await readFramedSyncReadyFactFrames(db, input.transferId,
    framedSyncBytes(transfer, 'active_attempt_id'), input.stagingKind);
  const first = validateFacts(facts);
  const nodeFacts = facts.filter((fact) => fact.kind === 2);
  const nodes = nodeFacts.map(restoreFramedSyncNodeMetadata);
  const readingStates = facts.filter((fact) => fact.kind === 1).map((fact) =>
    fact.objectType === 'node' ? restoreFramedSyncNodeReadingFact(fact) : restoreFramedSyncObjectStateFact(fact));
  const bodyRows = await db.query<DbRow>(`SELECT pin.sha256, pin.byte_length, pin.role, pin.required
    FROM ${tables.alias}.${tables.prefix}_blob_pins pin
    JOIN ${tables.alias}.${tables.prefix}_available_blobs available ON available.sha256 = pin.sha256
    WHERE pin.transfer_id = ? AND pin.role IN (1, 5)`, [input.transferId]);
  const descriptors = validateBodies(facts, nodeFacts, bodyRows);
  const resources = await db.query<DbRow>(`SELECT pin.sha256, pin.byte_length, pin.role, pin.required, pin.storage_key
    FROM ${tables.alias}.${tables.prefix}_resource_pins pin
    JOIN ${tables.alias}.${tables.prefix}_available_resources available ON available.sha256 = pin.sha256
      AND available.byte_length = pin.byte_length AND available.storage_key = pin.storage_key
    WHERE pin.transfer_id = ?`, [input.transferId]);
  if (nodeFacts.length) validateResources(nodeFacts, nodes, resources, input.resourceStorageKeys ?? []);
  else if (resources.length || input.resourceStorageKeys?.length) throw new Error('framed_sync_android_blob_set_mismatch');
  return { contentId: framedSyncBytes(transfer, 'content_id'), descriptors, facts, readingStates,
    globalId: first.globalId, objectType: first.objectType };
}
