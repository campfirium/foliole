import type { DatabaseDriver } from './driver.js';

export type KeepImportItemStatus = 'blocked_deleted' | 'degraded' | 'duplicate' | 'failed' | 'imported';

export interface KeepImportItemRow {
  [column: string]: unknown;
  first_seen_at: string;
  highlight_source_mtime_ms: number | null;
  highlight_source_size_bytes: number | null;
  last_imported_at: string | null;
  last_node_id: string | null;
  last_seen_at: string;
  last_status: KeepImportItemStatus;
  rule_id: string;
  source_mtime_ms: number;
  source_path: string;
  source_size_bytes: number;
}

export interface UpsertKeepImportItemInput {
  firstSeenAt?: string;
  highlightSourceMtimeMs?: number | null;
  highlightSourceSizeBytes?: number | null;
  lastImportedAt: string | null;
  lastNodeId: string | null;
  lastSeenAt: string;
  lastStatus: KeepImportItemStatus;
  ruleId: string;
  sourceMtimeMs: number;
  sourcePath: string;
  sourceSizeBytes: number;
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
              highlight_source_mtime_ms, highlight_source_size_bytes, last_node_id,
              last_status, first_seen_at, last_seen_at, last_imported_at
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

export function upsertKeepImportItem(driver: DatabaseDriver, input: UpsertKeepImportItemInput) {
  driver.execute(
    `INSERT INTO keep_import_items (
       rule_id, source_path, source_mtime_ms, source_size_bytes,
       highlight_source_mtime_ms, highlight_source_size_bytes, last_node_id,
       last_status, first_seen_at, last_seen_at, last_imported_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(rule_id, source_path) DO UPDATE SET
       source_mtime_ms = excluded.source_mtime_ms,
       source_size_bytes = excluded.source_size_bytes,
       highlight_source_mtime_ms = excluded.highlight_source_mtime_ms,
       highlight_source_size_bytes = excluded.highlight_source_size_bytes,
       last_node_id = excluded.last_node_id,
       last_status = excluded.last_status,
       first_seen_at = COALESCE(keep_import_items.first_seen_at, excluded.first_seen_at),
       last_seen_at = excluded.last_seen_at,
       last_imported_at = excluded.last_imported_at`,
    [
      input.ruleId,
      input.sourcePath,
      input.sourceMtimeMs,
      input.sourceSizeBytes,
      input.highlightSourceMtimeMs ?? null,
      input.highlightSourceSizeBytes ?? null,
      input.lastNodeId,
      input.lastStatus,
      input.firstSeenAt ?? input.lastSeenAt,
      input.lastSeenAt,
      input.lastImportedAt
    ]
  );
}
