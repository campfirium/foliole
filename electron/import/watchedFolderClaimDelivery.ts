import type { DatabaseDriver } from '../../lib/core/database/driver.js';

const MOBILE_DEVICE_KINDS = ['android', 'android-capacitor', 'ios', 'ios-capacitor'] as const;

export function ensureWatchedFolderClaimReceipts(driver: DatabaseDriver, bindingId: string) {
  removeObsoleteClaimReceipts(driver, bindingId);
  driver.execute(
    `INSERT OR IGNORE INTO sync_delivery_receipts (
      peer_id, stream_name, operation_id, object_type, object_id, payload_identity,
      local_position, status, remote_position, issue_reason, created_at, updated_at
    )
    SELECT member.device_id, 'watched_folder_claim',
      'watched_folder_claim:' || binding.binding_id || ':' || binding.claim_revision || ':' || member.authorization_id,
      'watched_folder', binding.binding_id, state.content_hash, CAST(state.state_seq AS TEXT),
      'pending', NULL, NULL, binding.updated_at, binding.updated_at
    FROM watched_folder_bindings binding
    JOIN sync_object_state state
      ON state.object_type = 'watched_folder' AND state.object_id = binding.binding_id
    JOIN sync_group_local_state local ON local.singleton_id = 1 AND local.member_state = 'active'
    JOIN sync_group_members member ON member.group_id = local.group_id
    WHERE binding.binding_id = ? AND binding.claim_state = 'proposed'
      AND binding.claim_revision IS NOT NULL AND member.state = 'active'
      AND member.device_id <> local.local_device_id
      AND member.device_kind NOT IN (${MOBILE_DEVICE_KINDS.map(() => '?').join(', ')})`,
    [bindingId, ...MOBILE_DEVICE_KINDS]
  );
}

export function isWatchedFolderClaimConfirmed(driver: DatabaseDriver, bindingId: string) {
  ensureWatchedFolderClaimReceipts(driver, bindingId);
  const row = driver.queryOne<{ missing: number }>(
    `SELECT COUNT(*) AS missing
     FROM watched_folder_bindings binding
     JOIN sync_group_local_state local ON local.singleton_id = 1 AND local.member_state = 'active'
     JOIN sync_group_members member ON member.group_id = local.group_id
     WHERE binding.binding_id = ? AND binding.claim_state = 'proposed'
       AND member.state = 'active' AND member.device_id <> local.local_device_id
       AND member.device_kind NOT IN (${MOBILE_DEVICE_KINDS.map(() => '?').join(', ')})
       AND NOT EXISTS (
         SELECT 1 FROM sync_delivery_receipts receipt
         WHERE receipt.peer_id = member.device_id
           AND receipt.stream_name = 'watched_folder_claim'
           AND receipt.operation_id = 'watched_folder_claim:' || binding.binding_id || ':' ||
             binding.claim_revision || ':' || member.authorization_id
           AND receipt.status = 'confirmed'
       )`,
    [bindingId, ...MOBILE_DEVICE_KINDS]
  );
  return (row?.missing ?? 0) === 0;
}

export function acknowledgeWatchedFolderDesktopDeliveries(
  driver: DatabaseDriver,
  peerDeviceId: string,
  throughStateSeq: number,
  now = new Date().toISOString()
) {
  if (!Number.isSafeInteger(throughStateSeq) || throughStateSeq <= 0) return 0;
  return driver.transaction(() => {
    const claims = driver.execute(
      `UPDATE sync_delivery_receipts AS receipt
       SET status = 'confirmed', remote_position = receipt.local_position, updated_at = ?
       WHERE receipt.peer_id = ? AND receipt.stream_name = 'watched_folder_claim'
         AND receipt.status <> 'confirmed' AND CAST(receipt.local_position AS INTEGER) <= ?
         AND EXISTS (
           SELECT 1 FROM watched_folder_bindings binding
           JOIN sync_group_local_state local ON local.singleton_id = 1 AND local.member_state = 'active'
           JOIN sync_group_members member ON member.group_id = local.group_id
           WHERE binding.binding_id = receipt.object_id AND binding.claim_state = 'proposed'
             AND member.device_id = receipt.peer_id AND member.state = 'active'
             AND receipt.operation_id = 'watched_folder_claim:' || binding.binding_id || ':' ||
               binding.claim_revision || ':' || member.authorization_id
         )`,
      [now, peerDeviceId, throughStateSeq]
    ).changes;
    driver.execute(
      `UPDATE sync_delivery_receipts SET status = 'confirmed', remote_position = local_position, updated_at = ?
       WHERE peer_id = ? AND stream_name = 'state' AND object_type = 'watched_folder'
         AND status <> 'confirmed' AND CAST(local_position AS INTEGER) <= ?`,
      [now, peerDeviceId, throughStateSeq]
    );
    return claims;
  });
}

function removeObsoleteClaimReceipts(driver: DatabaseDriver, bindingId: string) {
  driver.execute(
    `DELETE FROM sync_delivery_receipts
     WHERE object_type = 'watched_folder' AND object_id = ? AND stream_name = 'watched_folder_claim'
       AND NOT EXISTS (
         SELECT 1 FROM watched_folder_bindings binding
         JOIN sync_group_local_state local ON local.singleton_id = 1 AND local.member_state = 'active'
         JOIN sync_group_members member ON member.group_id = local.group_id
         WHERE binding.binding_id = sync_delivery_receipts.object_id
           AND binding.claim_state = 'proposed' AND member.state = 'active'
           AND member.device_id = sync_delivery_receipts.peer_id
           AND sync_delivery_receipts.operation_id = 'watched_folder_claim:' || binding.binding_id || ':' ||
             binding.claim_revision || ':' || member.authorization_id
       )`,
    [bindingId]
  );
}
