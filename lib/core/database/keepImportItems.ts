import type { DatabaseDriver } from './driver.js';

export type KeepImportItemStatus = 'blocked_deleted' | 'degraded' | 'discovered' | 'duplicate' | 'failed' | 'imported';
export type KeepImportSourceState = 'missing' | 'present';
export type KeepImportLocalNodeState = 'active' | 'locally_deleted' | 'not_imported';

export interface KeepImportItemRow {
  [column: string]: unknown;
  deleted_at: string | null;
  first_seen_at: string;
  has_source_update: number;
  highlight_source_mtime_ms: number | null;
  highlight_source_size_bytes: number | null;
  local_node_state: KeepImportLocalNodeState;
  last_imported_at: string | null;
  last_node_id: string | null;
  last_seen_at: string;
  last_status: KeepImportItemStatus;
  rule_id: string;
  source_mtime_ms: number;
  source_path: string;
  source_size_bytes: number;
  source_state: KeepImportSourceState;
}

export interface UpsertKeepImportItemInput {
  deletedAt?: string | null;
  firstSeenAt?: string;
  hasSourceUpdate: boolean;
  highlightSourceMtimeMs?: number | null;
  highlightSourceSizeBytes?: number | null;
  localNodeState?: KeepImportLocalNodeState;
  lastImportedAt: string | null;
  lastNodeId: string | null;
  lastSeenAt: string;
  lastStatus: KeepImportItemStatus;
  ruleId: string;
  sourceMtimeMs: number;
  sourcePath: string;
  sourceSizeBytes: number;
  sourceState?: KeepImportSourceState;
}

interface KeepImportNodeStateRow {
  [column: string]: unknown;
  deleted_at: string | null;
  id: string;
}

export function readKeepImportItem(driver: DatabaseDriver, ruleId: string, sourcePath: string) {
  return (
    driver.queryOne<KeepImportItemRow>(
      `SELECT rule_id, source_path, source_mtime_ms, source_size_bytes,
              highlight_source_mtime_ms, highlight_source_size_bytes, source_state, local_node_state,
              has_source_update, last_node_id,
              last_status, first_seen_at, last_seen_at, deleted_at, last_imported_at
       FROM keep_import_items
       WHERE rule_id = ? AND source_path = ?`,
      [ruleId, sourcePath]
    ) ?? null
  );
}

export function readKeepImportNodeState(driver: DatabaseDriver, nodeId: string) {
  return (
    driver.queryOne<KeepImportNodeStateRow>(
      `SELECT id, deleted_at
       FROM nodes
       WHERE id = ?`,
      [nodeId]
    ) ?? null
  );
}

export function listPresentKeepImportItems(driver: DatabaseDriver) {
  return driver.queryAll<KeepImportItemRow>(
    `SELECT rule_id, source_path, source_mtime_ms, source_size_bytes,
            highlight_source_mtime_ms, highlight_source_size_bytes, source_state, local_node_state,
            has_source_update, last_node_id,
            last_status, first_seen_at, last_seen_at, deleted_at, last_imported_at
     FROM keep_import_items
     WHERE source_state = 'present'
     ORDER BY last_seen_at DESC, source_path ASC`
  );
}

export function listRemovedKeepImportItems(driver: DatabaseDriver) {
  return driver.queryAll<KeepImportItemRow>(
    `SELECT rule_id, source_path, source_mtime_ms, source_size_bytes,
            highlight_source_mtime_ms, highlight_source_size_bytes, source_state, local_node_state,
            has_source_update, last_node_id,
            last_status, first_seen_at, last_seen_at, deleted_at, last_imported_at
     FROM keep_import_items
     WHERE source_state = 'present'
       AND local_node_state = 'locally_deleted'
       AND last_status = 'blocked_deleted'
     ORDER BY deleted_at DESC, source_path ASC`
  );
}

export function markKeepImportItemsLocallyDeletedByNodeDeletedAt(
  driver: DatabaseDriver,
  nodeDeletedAt: Array<{ deletedAt: string; nodeId: string }>
) {
  if (nodeDeletedAt.length === 0) {
    return;
  }
  const statement = driver.prepare(
    `UPDATE keep_import_items
     SET local_node_state = 'locally_deleted',
         last_status = 'blocked_deleted',
         deleted_at = ?
     WHERE source_state = 'present'
       AND last_node_id = ?`
  );
  for (const row of nodeDeletedAt) {
    statement.run([row.deletedAt, row.nodeId]);
  }
}

export function markMissingKeepImportItems(driver: DatabaseDriver, ruleId: string, presentSourcePaths: string[]) {
  if (presentSourcePaths.length === 0) {
    driver.execute(
      `UPDATE keep_import_items
       SET source_state = 'missing'
       WHERE rule_id = ?`,
      [ruleId]
    );
    return;
  }
  const placeholders = presentSourcePaths.map(() => '?').join(', ');
  driver.execute(
    `UPDATE keep_import_items
     SET source_state = 'missing'
     WHERE rule_id = ? AND source_path NOT IN (${placeholders})`,
    [ruleId, ...presentSourcePaths]
  );
}

export function upsertKeepImportItem(driver: DatabaseDriver, input: UpsertKeepImportItemInput) {
  driver.execute(
    `INSERT INTO keep_import_items (
       rule_id, source_path, source_mtime_ms, source_size_bytes,
       highlight_source_mtime_ms, highlight_source_size_bytes, source_state, local_node_state,
       has_source_update, last_node_id,
       last_status, first_seen_at, last_seen_at, deleted_at, last_imported_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(rule_id, source_path) DO UPDATE SET
       source_mtime_ms = excluded.source_mtime_ms,
       source_size_bytes = excluded.source_size_bytes,
       highlight_source_mtime_ms = excluded.highlight_source_mtime_ms,
       highlight_source_size_bytes = excluded.highlight_source_size_bytes,
       source_state = excluded.source_state,
       local_node_state = excluded.local_node_state,
       has_source_update = excluded.has_source_update,
       last_node_id = excluded.last_node_id,
       last_status = excluded.last_status,
       first_seen_at = COALESCE(keep_import_items.first_seen_at, excluded.first_seen_at),
       last_seen_at = excluded.last_seen_at,
       deleted_at = CASE
         WHEN excluded.local_node_state = 'locally_deleted'
         THEN COALESCE(keep_import_items.deleted_at, excluded.deleted_at, keep_import_items.last_seen_at)
         ELSE NULL
       END,
       last_imported_at = excluded.last_imported_at`,
    [
      input.ruleId,
      input.sourcePath,
      input.sourceMtimeMs,
      input.sourceSizeBytes,
      input.highlightSourceMtimeMs ?? null,
      input.highlightSourceSizeBytes ?? null,
      input.sourceState ?? 'present',
      input.localNodeState ?? (input.lastNodeId ? 'active' : 'not_imported'),
      input.hasSourceUpdate ? 1 : 0,
      input.lastNodeId,
      input.lastStatus,
      input.firstSeenAt ?? input.lastSeenAt,
      input.lastSeenAt,
      input.deletedAt ?? null,
      input.lastImportedAt
    ]
  );
}
