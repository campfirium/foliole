import type { DbPort } from './dbPort.js';
import { collectNodeVersionPayloads } from './nodeVersionPayloadCollector.js';
import { isStoredAncestorVersion } from './syncNodeGraph.js';

function pushHoldId(peerId: string, operationId: string) {
  return JSON.stringify(['push', peerId, operationId]);
}

/** A concrete send, unlike the pending queue, keeps the exact version until acknowledged. */
export async function stageNodeVersionPush(port: DbPort, peerId: string, operationId: string,
  nodeId: string, versionId: string, now: string) {
  const [group] = await port.query<{ group_id: string }>(`SELECT local.group_id
    FROM sync_group_local_state local JOIN sync_group_devices peer ON peer.group_id = local.group_id
    WHERE local.singleton_id = 1 AND local.state = 'active' AND peer.state = 'active'
      AND peer.device_identity_key = ? AND peer.device_identity_key <> local.local_device_identity_key`, [peerId]);
  if (!group) return;
  const [version] = await port.query('SELECT 1 FROM node_sync_versions WHERE object_id = ? AND version_id = ?',
    [nodeId, versionId]);
  if (!version) throw new Error('node_version_push_payload_unavailable');
  await port.run(`INSERT OR IGNORE INTO node_version_outbound_holds
    (pack_id, group_id, device_identity_key, object_id, version_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  [pushHoldId(peerId, operationId), group.group_id, peerId, nodeId, versionId, now]);
}

export async function confirmNodeVersionPush(port: DbPort, peerId: string, operationId: string,
  nodeId: string, versionId: string) {
  const packId = pushHoldId(peerId, operationId);
  const [hold] = await port.query<{ group_id: string; version_id: string }>(
    'SELECT group_id, version_id FROM node_version_outbound_holds WHERE pack_id = ? AND object_id = ?', [packId, nodeId]);
  if (!hold) return;
  if (hold.version_id !== versionId) throw new Error('node_version_push_ack_identity_mismatch');
  const [base] = await port.query<{ version_id: string }>(`SELECT version_id FROM node_version_device_bases
    WHERE group_id = ? AND device_identity_key = ? AND object_id = ?`, [hold.group_id, peerId, nodeId]);
  if (base && await isStoredAncestorVersion(port, base.version_id, versionId)) {
    await port.run(`UPDATE node_version_device_bases SET version_id = ?
      WHERE group_id = ? AND device_identity_key = ? AND object_id = ?`, [versionId, hold.group_id, peerId, nodeId]);
  }
  await port.run('DELETE FROM node_version_outbound_holds WHERE pack_id = ? AND object_id = ?', [packId, nodeId]);
  await collectNodeVersionPayloads(port, nodeId, Number.MAX_SAFE_INTEGER);
}
