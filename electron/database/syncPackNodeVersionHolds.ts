import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import type { SyncPackNodeVersionRow } from '../../lib/core/sync/syncPackNodeVersions.js';

import type { NodePackRow } from './syncPackRows.js';

export function stageDesktopSyncPackNodeHolds(args: {
  createdAt: string;
  driver: DatabaseDriver;
  fromPeerId: string;
  nodes: NodePackRow[];
  packId: string;
  toPeerId: string;
  versions: SyncPackNodeVersionRow[];
  knownVersionIds?: string[];
}) {
  const local = args.driver.queryOne<{ group_id: string }>(
    `SELECT local.group_id FROM sync_group_local_state local
     JOIN sync_group_devices source ON source.group_id = local.group_id
       AND source.device_identity_key = local.local_device_identity_key
     JOIN sync_group_devices target ON target.group_id = local.group_id
       AND target.device_identity_key = ?
     WHERE local.singleton_id = 1 AND local.state = 'active'
       AND source.state = 'active' AND target.state = 'active'
       AND local.local_device_identity_key = ?`,
    [args.toPeerId, args.fromPeerId]
  );
  if (!local) throw new Error('node_version_pack_peer_unavailable');
  const versions = new Map(args.versions.map((row) => [row.version_id, row]));
  const knownVersions = new Set(args.knownVersionIds ?? []);
  const heads = args.nodes.filter((node) => node.current_version_id);
  for (const node of heads) {
    const versionId = node.current_version_id!;
    const head = versions.get(versionId) ?? (knownVersions.has(versionId)
      ? args.driver.queryOne<SyncPackNodeVersionRow>(
        'SELECT * FROM node_sync_versions WHERE version_id = ? AND object_id = ?',
        [versionId, node.id]) : undefined);
    if (!head || head.object_id !== node.id || !hasPayload(head)) {
      throw new Error('node_version_pack_head_unavailable');
    }
    args.driver.execute(
      `INSERT INTO node_version_outbound_holds
       (pack_id, group_id, device_identity_key, object_id, version_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [args.packId, local.group_id, args.toPeerId, node.id, versionId, args.createdAt]
    );
  }
  const protectedNodeIds = new Set(heads.map((node) => node.id));
  for (const version of args.versions) {
    if (!protectedNodeIds.has(version.object_id) || !hasPayload(version)) continue;
    args.driver.execute(
      `INSERT INTO node_version_outbound_payload_holds (pack_id, object_id, version_id)
       VALUES (?, ?, ?)`, [args.packId, version.object_id, version.version_id]
    );
  }
}

function hasPayload(row: SyncPackNodeVersionRow) {
  if (row.body_text !== null) return true;
  const snapshot = JSON.parse(row.snapshot_json) as { content?: unknown };
  return snapshot.content === undefined || typeof snapshot.content === 'string';
}
