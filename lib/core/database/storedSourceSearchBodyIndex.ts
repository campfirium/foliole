import type { DatabaseDriver, DatabaseRow } from './driver.js';
import type { StoredSourceInvalidationType } from './storedSourceSearchInvalidations.js';

const EXTERNAL_ROW_SQL = `SELECT d.title, d.file_name || ' ' || d.relative_path AS path,
  d.content, NULL AS preview,
  json_object('document_id', d.document_id, 'folder_id', d.folder_id,
    'relative_path', d.relative_path, 'file_name', d.file_name, 'extension', d.extension,
    'title', d.title, 'opening_text', d.opening_text, 'reference_kind', d.reference_kind,
    'reference_json', d.reference_json, 'source_modified_at', d.source_modified_at, 'updated_at', d.updated_at) AS metadata,
  d.updated_at FROM external_documents d WHERE d.is_present = 1 AND d.document_id = ?`;
const REMOVED_ROW_SQL = `SELECT COALESCE(NULLIF(c.title, ''), i.source_path) AS title,
  i.source_path AS path, c.content, COALESCE(c.content_preview, '') AS preview,
  json_object('ruleId', i.rule_id, 'sourcePath', i.source_path, 'deletedAt', COALESCE(i.deleted_at, i.first_seen_at),
    'firstSeenAt', i.first_seen_at, 'hasSourceUpdate', i.has_source_update,
    'lastImportedAt', i.last_imported_at, 'lastNodeId', i.last_node_id, 'contentPreview', c.content_preview) AS metadata,
  COALESCE(i.deleted_at, i.first_seen_at) AS updated_at
  FROM keep_import_items i LEFT JOIN keep_import_item_cache c
    ON c.rule_id = i.rule_id AND c.source_path = i.source_path
  WHERE i.source_state = 'present' AND i.local_node_state = 'locally_deleted'
    AND i.last_status = 'blocked_deleted' AND i.rule_id || ':' || i.source_path = ?`;

interface SourceRow extends DatabaseRow {
  title: string; path: string; content: string | null;
  preview: string | null; metadata: string; updated_at: string;
}

/** Independent background index only; one source article is read under the database transaction. */
export function syncStoredSourceSearchIndexForTargets(driver: DatabaseDriver, targets: readonly {
  type: StoredSourceInvalidationType; targetId: string;
}[]) {
  for (const target of targets) driver.transaction(() => {
    const kind = target.type === 'stored_source_external' ? 'external' : 'removed';
    const row = driver.queryOne<SourceRow>(kind === 'external' ? EXTERNAL_ROW_SQL : REMOVED_ROW_SQL, [target.targetId]);
    const content = row ? row.content ?? row.preview ?? '' : null;
    driver.execute('DELETE FROM stored_source_search WHERE kind = ? AND source_key = ?', [kind, target.targetId]);
    if (row) driver.execute(`INSERT INTO stored_source_search
      (title, path, content, kind, source_key, metadata, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [row.title, row.path, content, kind, target.targetId, row.metadata, row.updated_at]);
  });
}
