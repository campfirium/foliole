import { createHash } from 'node:crypto';

function fingerprint(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function tableExists(database, table) {
  return database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
  ).get(table) !== undefined;
}

export function pendingDeliveryCountsByPeerFingerprint(database) {
  if (!tableExists(database, 'sync_delivery_receipts')) return {};
  const statement = database.prepare(`SELECT member.device_id AS peer_id, COUNT(*) AS count
    FROM sync_object_state state
    JOIN sync_group_local_state local ON local.singleton_id = 1
    JOIN sync_group_members member ON member.group_id = local.group_id
      AND member.state = 'active' AND member.device_id <> local.local_device_id
      AND state.updated_at >= member.joined_at
    WHERE state.sync_dirty = 1 AND state.object_type <> 'view_state'
      AND NOT EXISTS (SELECT 1 FROM sync_delivery_receipts receipt
        WHERE receipt.peer_id = member.device_id
          AND receipt.object_type = state.object_type AND receipt.object_id = state.object_id
          AND receipt.payload_identity = CASE WHEN state.object_type = 'node'
            THEN state.current_version_id ELSE state.content_hash END
          AND receipt.status IN ('accepted', 'confirmed'))
    GROUP BY member.device_id ORDER BY member.device_id`);
  if (typeof statement.all !== 'function') return {};
  return Object.fromEntries(statement.all().map(({ count, peer_id: peerId }) => [
    fingerprint(peerId), Number(count)
  ]));
}

export function currentDeliveryStatusCountsByPeerFingerprint(database) {
  if (!tableExists(database, 'sync_delivery_receipts')) return {};
  const statement = database.prepare(`SELECT receipt.peer_id, receipt.status, COUNT(*) AS count
    FROM sync_delivery_receipts receipt
    JOIN sync_object_state state
      ON state.object_type = receipt.object_type AND state.object_id = receipt.object_id
      AND state.sync_dirty = 1
      AND receipt.payload_identity = CASE WHEN state.object_type = 'node'
        THEN state.current_version_id ELSE state.content_hash END
    GROUP BY receipt.peer_id, receipt.status ORDER BY receipt.peer_id, receipt.status`);
  if (typeof statement.all !== 'function') return {};
  const rows = statement.all();
  const result = {};
  for (const { count, peer_id: peerId, status } of rows) {
    const peer = fingerprint(peerId);
    result[peer] = { ...result[peer], [status]: Number(count) };
  }
  return result;
}
