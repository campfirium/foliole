import type { DbParams } from '../sync/dbPort.js';

import type { ParentOrderUpgradedPublication } from './currentParentOrderPublicationUpgrade.js';

export interface ParentOrderUpgradeStatement { sql: string; params: DbParams; }

/** The caller verifies the new frozen owners before executing retirement statements. */
export function parentOrderPublicationProtectionStatements(value: ParentOrderUpgradedPublication): ParentOrderUpgradeStatement[] {
  const { context, manifest, transferId, contentId } = value;
  return [{ sql: `INSERT INTO framed_sync_outbound_publications
    (transfer_id, content_id, manifest_hash, canonical_manifest, manifest_json, protocol_version,
      group_id, sender_device_id, sender_library_epoch, receiver_device_id, receiver_library_epoch,
      fact_count, blob_count, total_blob_bytes, state)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')`, params: [transferId, contentId,
    contentId, new Uint8Array(), value.manifestJson, context.protocolVersion, context.groupId,
    context.senderDeviceId, context.senderLibraryEpoch, context.receiverDeviceId, context.receiverLibraryEpoch,
    manifest.facts.length, manifest.blobs.length, manifest.blobs.reduce((sum, blob) => sum + blob.byteLength, 0n)] },
  ...manifest.facts.map((fact) => ({ sql: 'INSERT INTO framed_sync_outbound_fact_refs VALUES (?, ?, ?, ?, ?)',
    params: [transferId, fact.kind, fact.objectType, fact.globalId, fact.factId] })),
  ...manifest.blobs.map((blob) => ({ sql: 'INSERT INTO framed_sync_outbound_blob_refs VALUES (?, ?, ?, ?, ?)',
    params: [transferId, blob.sha256, blob.byteLength, blob.role, blob.required ? 1 : 0] })),
  { sql: 'INSERT INTO framed_sync_outbound_holds VALUES (?, ?)', params: [transferId, context.receiverDeviceId] }];
}

export function parentOrderPublicationRetirementStatements(transferId: Uint8Array): ParentOrderUpgradeStatement[] {
  return [{ sql: `UPDATE framed_sync_outbound_publications SET state = 'terminated',
    retirement_reason = 'parent-order-format-upgrade' WHERE transfer_id = ?`, params: [transferId] },
  { sql: 'DELETE FROM framed_sync_outbound_holds WHERE transfer_id = ?', params: [transferId] },
  { sql: 'DELETE FROM framed_sync_outbound_attempts WHERE transfer_id = ?', params: [transferId] },
  { sql: 'INSERT OR IGNORE INTO framed_sync_completion_windows VALUES (?, ?)', params: [transferId, Date.now()] }];
}
