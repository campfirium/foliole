import type { DatabaseDriver, DatabaseRow } from './driver.js';

export interface KeepImportItemCacheRow extends DatabaseRow {
  content: string | null;
  content_preview: string | null;
  refresh_error: string | null;
  refreshed_at: string;
  rule_id: string;
  source_mtime_ms: number;
  source_path: string;
  source_size_bytes: number;
  title: string;
}

export interface UpsertKeepImportItemCacheInput {
  content: string | null;
  contentPreview: string | null;
  refreshError?: string | null;
  refreshedAt: string;
  ruleId: string;
  sourceMtimeMs: number;
  sourcePath: string;
  sourceSizeBytes: number;
  title: string;
}

export function readKeepImportItemCache(driver: DatabaseDriver, ruleId: string, sourcePath: string) {
  return (
    driver.queryOne<KeepImportItemCacheRow>(
      `SELECT rule_id, source_path, title, content, content_preview,
              source_mtime_ms, source_size_bytes, refreshed_at, refresh_error
       FROM keep_import_item_cache
       WHERE rule_id = ? AND source_path = ?`,
      [ruleId, sourcePath]
    ) ?? null
  );
}

export function upsertKeepImportItemCache(driver: DatabaseDriver, input: UpsertKeepImportItemCacheInput) {
  driver.execute(
    `INSERT INTO keep_import_item_cache (
       rule_id, source_path, title, content, content_preview,
       source_mtime_ms, source_size_bytes, refreshed_at, refresh_error
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(rule_id, source_path) DO UPDATE SET
       title = excluded.title,
       content = excluded.content,
       content_preview = excluded.content_preview,
       source_mtime_ms = excluded.source_mtime_ms,
       source_size_bytes = excluded.source_size_bytes,
       refreshed_at = excluded.refreshed_at,
       refresh_error = excluded.refresh_error`,
    [
      input.ruleId,
      input.sourcePath,
      input.title,
      input.content,
      input.contentPreview,
      input.sourceMtimeMs,
      input.sourceSizeBytes,
      input.refreshedAt,
      input.refreshError ?? null
    ]
  );
}
