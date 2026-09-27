import type { DbPort, DbRow } from './dbPort.js';
import { loadMergeBase } from './syncNodeGraph.js';

interface VersionRow extends DbRow {
  body_text: string | null;
  object_id: string;
  parent_version_id: string | null;
  snapshot_json: string;
  version_id: string;
}

interface BaseRow extends DbRow {
  base_epoch: string | null;
  base_revision: number | null;
  blocked_reason: string | null;
  device_identity_key: string;
  peer_epoch: string | null;
  peer_revision: number | null;
  version_id: string | null;
}

export interface NodeVersionCollectionResult {
  released: number;
  skipped: string | null;
}

export async function collectNodeVersionPayloads(
  port: DbPort,
  nodeId: string,
  limit = 32
): Promise<NodeVersionCollectionResult> {
  return port.transaction(async (tx) => {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('invalid_version_collection_limit');
    const [node] = await tx.query<{ current_version_id: string | null; sync_dirty: number }>(
      'SELECT current_version_id, sync_dirty FROM nodes WHERE id = ?', [nodeId]
    );
    if (!node?.current_version_id || node.sync_dirty !== 0) return skip('unversioned_or_dirty');
    const [local] = await tx.query<{ group_id: string; local_device_identity_key: string }>(
      `SELECT group_id, local_device_identity_key FROM sync_group_local_state
       WHERE singleton_id = 1 AND state = 'active'`
    );
    if (!local) return skip('group_unavailable');
    const versions = await tx.query<VersionRow>(
      `SELECT version_id, object_id, parent_version_id, body_text, snapshot_json
       FROM node_sync_versions WHERE object_id = ?`, [nodeId]
    );
    const byId = new Map(versions.map((row) => [row.version_id, row]));
    if (!byId.has(node.current_version_id)) return skip('current_version_missing');
    const protectedIds = await loadProtectedIds(
      tx, nodeId, local.group_id, local.local_device_identity_key, node.current_version_id
    );
    if (!protectedIds) return skip('peer_base_unknown');
    if (await hasUnresolvedHistory(tx, nodeId)) return skip('pending_local_history');
    const parents = await loadParents(tx, versions);
    const reachable = walkAllLineages(parents, byId);
    if (!reachable) return skip('lineage_unproven');
    if ([...protectedIds].some((id) => !reachable.has(id) || !hasBody(byId.get(id)!))) {
      return skip('protected_body_unavailable');
    }
    const releasable = versions.filter((row) => !protectedIds.has(row.version_id) && hasBody(row))
      .slice(0, limit);
    for (const row of releasable) {
      const snapshot = JSON.parse(row.snapshot_json) as Record<string, unknown>;
      await tx.run(
        `UPDATE node_sync_versions SET body_text = NULL, snapshot_json = ?
         WHERE version_id = ? AND object_id = ?`,
        [JSON.stringify({ ...snapshot, content: null }), row.version_id, nodeId]
      );
    }
    return { released: releasable.length, skipped: null };
  });
}

async function loadProtectedIds(
  port: DbPort,
  nodeId: string,
  groupId: string,
  localDeviceId: string,
  currentId: string
) {
  const bases = await port.query<BaseRow>(
    `SELECT peer.device_identity_key, base.version_id,
       base.library_epoch AS base_epoch, base.proof_revision AS base_revision,
       revision.library_epoch AS peer_epoch, revision.proof_revision AS peer_revision,
       revision.blocked_reason FROM sync_group_devices peer
     LEFT JOIN node_version_device_bases base
       ON base.group_id = peer.group_id AND base.device_identity_key = peer.device_identity_key
         AND base.object_id = ? AND base.library_epoch <> '' AND base.proof_revision >= 0
     LEFT JOIN node_version_device_revisions revision
       ON revision.group_id = peer.group_id AND revision.device_identity_key = peer.device_identity_key
     WHERE peer.group_id = ? AND peer.state = 'active' AND peer.device_identity_key <> ?`,
    [nodeId, groupId, localDeviceId]
  );
  if (bases.some((base) => !base.version_id || !base.peer_epoch || base.blocked_reason ||
      base.base_epoch !== base.peer_epoch || base.base_revision! > base.peer_revision!)) return null;
  const ids = new Set<string>([currentId]);
  for (const base of bases) {
    ids.add(base.version_id!);
    const common = await loadMergeBase(port, base.version_id!, currentId).catch(() => null);
    if (!common || common.object_id !== nodeId) return null;
    ids.add(common.version_id);
  }
  for (const row of await port.query<{ version_id: string }>(
    `SELECT version_id FROM node_version_outbound_holds WHERE group_id = ? AND object_id = ?
     UNION SELECT version_id FROM node_version_outbound_payload_holds WHERE object_id = ?
     UNION SELECT version_id FROM node_version_local_holds WHERE object_id = ?`,
    [groupId, nodeId, nodeId, nodeId]
  )) ids.add(row.version_id);
  for (const id of await loadPersistentReferences(port, nodeId)) ids.add(id);
  return ids;
}

async function loadPersistentReferences(port: DbPort, nodeId: string) {
  const rows = await port.query<{ version_id: string | null }>(
    `SELECT base_version_id AS version_id FROM sync_change_log
       WHERE object_type = 'node' AND object_id = ? AND applied_at IS NULL
     UNION SELECT result_version_id FROM sync_change_log
       WHERE object_type = 'node' AND object_id = ? AND applied_at IS NULL
     UNION SELECT conflict_version_id FROM node_sync_conflicts WHERE object_id = ?
     UNION SELECT parent_version_id FROM node_sync_conflicts WHERE object_id = ?
     UNION SELECT source_version_id FROM node_text_alternatives WHERE node_id = ? AND status = 'available'
     UNION SELECT anchor_source_version_id FROM nodes
       WHERE anchor_source_version_id IN
         (SELECT version_id FROM node_sync_versions WHERE object_id = ?)
     UNION SELECT current_version_id FROM sync_object_state
       WHERE object_type = 'node' AND object_id = ?
     UNION SELECT parent_version_id FROM node_sync_tombstones WHERE node_id = ?`,
    [nodeId, nodeId, nodeId, nodeId, nodeId, nodeId, nodeId, nodeId]
  );
  return rows.map((row) => row.version_id).filter((id): id is string => Boolean(id));
}

async function hasUnresolvedHistory(port: DbPort, nodeId: string) {
  const rows = await port.query<DbRow>(
    `SELECT 1 FROM sync_change_log WHERE object_type = 'node'
       AND object_id = ? AND applied_at IS NULL LIMIT 1`, [nodeId]
  );
  return rows.length > 0;
}

async function loadParents(port: DbPort, versions: VersionRow[]) {
  const parents = new Map(versions.map((row) => [row.version_id, [] as string[]]));
  for (const row of await port.query<{ parent_version_id: string; version_id: string }>(
    `SELECT parent.version_id, parent.parent_version_id FROM node_sync_version_parents parent
     JOIN node_sync_versions version ON version.version_id = parent.version_id
     WHERE version.object_id = ? ORDER BY parent.version_id, parent.ordinal`,
    [versions[0]?.object_id ?? '']
  )) parents.get(row.version_id)?.push(row.parent_version_id);
  for (const row of versions) {
    if (parents.get(row.version_id)?.length === 0 && row.parent_version_id) {
      parents.get(row.version_id)?.push(row.parent_version_id);
    }
  }
  return parents;
}

function walkAllLineages(
  parents: Map<string, string[]>,
  versions: Map<string, VersionRow>
) {
  const seen = new Set<string>();
  const visiting = new Set<string>();
  function visit(id: string): boolean {
    if (visiting.has(id) || !versions.has(id)) return false;
    if (seen.has(id)) return true;
    visiting.add(id);
    for (const parent of parents.get(id) ?? []) if (!visit(parent)) return false;
    visiting.delete(id);
    seen.add(id);
    return true;
  }
  for (const id of versions.keys()) if (!visit(id)) return null;
  return seen;
}

function hasBody(row: VersionRow) {
  if (row.body_text !== null) return true;
  const snapshot = JSON.parse(row.snapshot_json) as { content?: unknown };
  return snapshot.content === undefined || typeof snapshot.content === 'string';
}

function skip(reason: string): NodeVersionCollectionResult {
  return { released: 0, skipped: reason };
}
