import { adoptVerifiedBodyWithDriver, stageTextBodyContentWithDriver } from './bodyContentWriteWithDriver.js';
import type { DatabaseDriver, DatabaseRow } from './driver.js';
import { collectTextBodyBlobCandidates } from './textBodyBlobCollection.js';
import { loadVerifiedBodyRefWithDriver, readBodyTextWithDriver } from './verifiedBodyWithDriver.js';

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

export function readKeepImportItemCache(driver: DatabaseDriver, ruleId: string, sourcePath: string,
  bodyStorage: 'continuous' | 'chunked' = 'continuous') {
  const row = driver.queryOne<KeepImportItemCacheRow & { body_blob_hash?: string | null; has_inline_body?: number }>(
      `SELECT rule_id, source_path, title, ${bodyStorage === 'continuous' ? 'content' : 'NULL AS content, body_blob_hash, content IS NOT NULL AS has_inline_body'}, content_preview,
              source_mtime_ms, source_size_bytes, refreshed_at, refresh_error
       FROM keep_import_item_cache
       WHERE rule_id = ? AND source_path = ?`,
      [ruleId, sourcePath]
    );
  if (!row) return null;
  if (bodyStorage === 'continuous') return row;
  const { body_blob_hash: hash, has_inline_body: inline, ...metadata } = row;
  if (!hash) {
    if (inline) throw new Error('body_content_unavailable');
    return metadata;
  }
  const ref = loadVerifiedBodyRefWithDriver(driver, hash);
  if (!ref) throw new Error('body_content_unavailable');
  return { ...metadata, content: readBodyTextWithDriver(driver, ref) };
}

export function upsertKeepImportItemCache(driver: DatabaseDriver, input: UpsertKeepImportItemCacheInput,
  bodyStorage: 'continuous' | 'chunked' = 'continuous') {
  if (bodyStorage === 'chunked') {
    return driver.transaction((tx) => {
      const previous = tx.queryOne<{ body_blob_hash: string | null }>(
        'SELECT body_blob_hash FROM keep_import_item_cache WHERE rule_id = ? AND source_path = ?', [input.ruleId, input.sourcePath]);
      const hash = input.content === null ? null : adoptVerifiedBodyWithDriver(tx,
        stageTextBodyContentWithDriver(tx, input.content), input.refreshedAt);
      writeKeepImportItemCache(tx, { ...input, content: null }, { hash });
      if (previous?.body_blob_hash && previous.body_blob_hash !== hash) {
        collectTextBodyBlobCandidates(tx, [previous.body_blob_hash], 'chunked');
      }
    });
  }
  writeKeepImportItemCache(driver, input);
}

function writeKeepImportItemCache(driver: DatabaseDriver, input: UpsertKeepImportItemCacheInput, body?: { hash: string | null }) {
  driver.execute(
    `INSERT INTO keep_import_item_cache (
       rule_id, source_path, title, content, content_preview,
       source_mtime_ms, source_size_bytes, refreshed_at, refresh_error${body ? ', body_blob_hash' : ''}
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?${body ? ', ?' : ''})
     ON CONFLICT(rule_id, source_path) DO UPDATE SET
       title = excluded.title,
       content = excluded.content,
       content_preview = excluded.content_preview,
       source_mtime_ms = excluded.source_mtime_ms,
       source_size_bytes = excluded.source_size_bytes,
       refreshed_at = excluded.refreshed_at,
       refresh_error = excluded.refresh_error${body ? ', body_blob_hash = excluded.body_blob_hash' : ''}`,
    [
      input.ruleId,
      input.sourcePath,
      input.title,
      input.content,
      input.contentPreview,
      input.sourceMtimeMs,
      input.sourceSizeBytes,
      input.refreshedAt,
      input.refreshError ?? null,
      ...(body ? [body.hash] : [])
    ]
  );
}
