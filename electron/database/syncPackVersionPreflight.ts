import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';

import type { SyncPackPageBudget } from './syncPackPageBudget.js';
import type { NodePackRow } from './syncPackRows.js';

interface VersionSizeRow extends DatabaseRow {
  body_bytes: number;
  object_id: string;
  parent_version_id: string | null;
  snapshot_bytes: number;
  version_id: string;
}

/** Checks the SQLite payload size before any version body crosses into JavaScript. */
export function assertSyncPackVersionBudget(
  driver: DatabaseDriver, nodes: Pick<NodePackRow, 'id' | 'current_version_id'>[],
  budget: SyncPackPageBudget, knownVersionIds: string[] = []
) {
  const visited = new Set<string>();
  const known = new Set(knownVersionIds);
  const pending = nodes.flatMap((node) => node.current_version_id
    ? [{ objectId: node.id, versionId: node.current_version_id }] : []);
  let bytes = 0;
  let rows = 0;
  while (pending.length > 0) {
    const next = pending.pop()!;
    if (visited.has(next.versionId)) continue;
    const version = driver.queryOne<VersionSizeRow>(
      `SELECT version_id, object_id, parent_version_id,
         coalesce(length(CAST(body_text AS BLOB)), 0) AS body_bytes,
         length(CAST(snapshot_json
           AS BLOB)) AS snapshot_bytes
       FROM node_sync_versions WHERE version_id = ?`, [next.versionId]
    );
    if (!version) continue;
    if (version.object_id !== next.objectId) {
      throw new Error(`sync_pack_node_version_cross_object:${next.versionId}`);
    }
    visited.add(next.versionId);
    if (!known.has(next.versionId)) {
      bytes += version.body_bytes + version.snapshot_bytes + 512;
      rows += 1;
    }
    if (bytes > budget.databaseBytes || rows > budget.applyRows) {
      throw new Error('sync_pack_page_preflight_exceeds_budget');
    }
    const parents = driver.queryAll<{ parent_version_id: string }>(
      `SELECT parent_version_id FROM node_sync_version_parents
       WHERE version_id = ? ORDER BY ordinal ASC LIMIT ?`,
      [next.versionId, budget.applyRows + 1]
    );
    if (parents.length > budget.applyRows - rows) {
      throw new Error('sync_pack_page_preflight_exceeds_budget');
    }
    if (parents.length > 0) {
      pending.push(...parents.map((parent) => ({ objectId: next.objectId,
        versionId: parent.parent_version_id })));
    } else if (version.parent_version_id) {
      pending.push({ objectId: next.objectId, versionId: version.parent_version_id });
    }
  }
}
