import { bytesToHex } from '@noble/hashes/utils.js';

import { framedSyncBytes, framedSyncText } from '../../../../../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbPort, DbRow } from '../../../../../../lib/core/sync/dbPort.js';
import type { CanonicalBlob } from '../../../../../../lib/core/sync/framedSyncCanonicalManifest.js';

import type { CompanionFramedSyncApplyInput } from './companionFramedSyncApply.js';
import { blob, sameBlob, uniqueRows, validateResourceEntries } from './companionFramedSyncDescriptorValidation.js';
import { companionReadyFactSource, summarizeCompanionReadyFacts } from './companionFramedSyncReadySummary.js';
import { loadCompanionFramedResourceReady } from './companionFramedSyncResourceApply.js';
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

function validateBodies(descriptors: readonly CanonicalBlob[], hasNodes: boolean, bodyRows: DbRow[]) {
  const bodies = uniqueRows(bodyRows);
  if (bodies.size !== new Set(descriptors.map((entry) => bytesToHex(entry.sha256))).size) {
    throw new Error('framed_sync_android_blob_identity_mismatch');
  }
  for (const descriptor of descriptors) {
    const row = bodies.get(bytesToHex(descriptor.sha256));
    if (!row || !sameBlob(descriptor, blob(row))) throw new Error('framed_sync_android_blob_identity_mismatch');
    if (!hasNodes && (descriptor.role !== 5 || !descriptor.required)) {
      throw new Error('framed_sync_external_document_body_invalid');
    }
  }
  return descriptors;
}

/** The caller keeps the attached native ready owner alive through the business transaction. */
export async function loadVerifiedCompanionReady(db: DbPort, input: CompanionFramedSyncApplyInput) {
  const tables = STAGING_TABLES[input.stagingKind];
  const transfer = await loadReadyIdentity(db, input);
  const source = companionReadyFactSource(input, framedSyncBytes(transfer, 'active_attempt_id'));
  const summary = await summarizeCompanionReadyFacts(db, source);
  const contentId = framedSyncBytes(transfer, 'content_id');
  const resourceUnit = await loadCompanionFramedResourceReady(db, input, summary.resourceFacts, contentId);
  if (resourceUnit) return { contentId, descriptors: [], source, resourceUnit,
    globalId: summary.globalId, objectType: summary.objectType };
  const bodyRows = await db.query<DbRow>(`SELECT pin.sha256, pin.byte_length, pin.role, pin.required
    FROM ${tables.alias}.${tables.prefix}_blob_pins pin
    JOIN ${tables.alias}.${tables.prefix}_available_blobs available ON available.sha256 = pin.sha256
    WHERE pin.transfer_id = ? AND pin.role IN (1, 5)`, [input.transferId]);
  const descriptors = validateBodies(summary.descriptors, summary.nodes.length > 0, bodyRows);
  const resources = await db.query<DbRow>(`SELECT pin.sha256, pin.byte_length, pin.role, pin.required, pin.storage_key
    FROM ${tables.alias}.${tables.prefix}_resource_pins pin
    JOIN ${tables.alias}.${tables.prefix}_available_resources available ON available.sha256 = pin.sha256
      AND available.byte_length = pin.byte_length AND available.storage_key = pin.storage_key
    WHERE pin.transfer_id = ?`, [input.transferId]);
  if (summary.nodes.length) validateResourceEntries(summary.nodes, resources, input.resourceStorageKeys ?? []);
  else if (resources.length || input.resourceStorageKeys?.length) throw new Error('framed_sync_android_blob_set_mismatch');
  return { contentId, descriptors, source, resourceUnit: null,
    globalId: summary.globalId, objectType: summary.objectType };
}
