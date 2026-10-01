import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { tableExists } from './numberedMigrationHelpers.js';
import { STORED_IMPORT_LOCATOR_SCHEMA, STORED_IMPORT_ROWS_SQL } from './storedImportLocatorSchema.js';

const EXTERNAL_ROWS_SQL = `SELECT d.title, d.file_name || ' ' || d.relative_path,
  COALESCE(CAST(cbd.data AS TEXT), d.content), 'external', d.document_id,
  json_object('document_id', d.document_id, 'folder_id', d.folder_id,
    'relative_path', d.relative_path, 'file_name', d.file_name, 'extension', d.extension,
    'title', d.title, 'opening_text', d.opening_text, 'reference_kind', d.reference_kind,
    'reference_json', d.reference_json, 'source_modified_at', d.source_modified_at, 'updated_at', d.updated_at),
  d.updated_at
FROM external_documents d LEFT JOIN content_blob_data cbd ON cbd.hash = d.body_blob_hash
WHERE d.is_present = 1`;

const REMOVED_ROWS_SQL = `SELECT COALESCE(NULLIF(c.title, ''), i.source_path), i.source_path,
  COALESCE(c.content, c.content_preview, ''), 'removed', i.rule_id || ':' || i.source_path,
  json_object('ruleId', i.rule_id, 'sourcePath', i.source_path, 'deletedAt', COALESCE(i.deleted_at, i.first_seen_at),
    'firstSeenAt', i.first_seen_at, 'hasSourceUpdate', i.has_source_update,
    'lastImportedAt', i.last_imported_at, 'lastNodeId', i.last_node_id, 'contentPreview', c.content_preview),
  COALESCE(i.deleted_at, i.first_seen_at)
FROM keep_import_items i LEFT JOIN keep_import_item_cache c
  ON c.rule_id = i.rule_id AND c.source_path = i.source_path
WHERE i.source_state = 'present' AND i.local_node_state = 'locally_deleted' AND i.last_status = 'blocked_deleted'`;

function sourceTrigger(table: string, event: 'INSERT' | 'UPDATE' | 'DELETE', kind: string, predicate: string) {
  const oldDelete = event === 'INSERT' ? '' : `DELETE FROM stored_source_search WHERE kind = '${kind}' AND ${predicate.replaceAll('ROW.', 'old.')};`;
  const newDelete = event === 'DELETE' ? '' : `DELETE FROM stored_source_search WHERE kind = '${kind}' AND ${predicate.replaceAll('ROW.', 'new.')};`;
  const rows = kind === 'external' ? EXTERNAL_ROWS_SQL : REMOVED_ROWS_SQL;
  const filter = table === 'external_documents' ? 'd.document_id = new.document_id'
    : 'i.rule_id = new.rule_id AND i.source_path = new.source_path';
  const insert = event === 'DELETE' && table !== 'keep_import_item_cache' ? ''
    : `INSERT INTO stored_source_search ${rows} AND ${event === 'DELETE' ? filter.replaceAll('new.', 'old.') : filter};`;
  return `CREATE TRIGGER IF NOT EXISTS stored_search_${table}_${event.toLowerCase()} AFTER ${event} ON ${table}
    BEGIN ${oldDelete} ${newDelete} ${insert} END`;
}

export const STORED_SOURCE_SEARCH_SCHEMA = [
  `CREATE VIRTUAL TABLE IF NOT EXISTS stored_source_search USING fts5(
    title, path, content, kind UNINDEXED, source_key UNINDEXED, metadata UNINDEXED, updated_at UNINDEXED
  )`,
  ...STORED_IMPORT_LOCATOR_SCHEMA,
  ...(['INSERT', 'UPDATE', 'DELETE'] as const).flatMap((event) => [
    sourceTrigger('external_documents', event, 'external', 'source_key = ROW.document_id'),
    sourceTrigger('keep_import_items', event, 'removed', "source_key = ROW.rule_id || ':' || ROW.source_path"),
    sourceTrigger('keep_import_item_cache', event, 'removed', "source_key = ROW.rule_id || ':' || ROW.source_path")
  ])
];

export function initializeStoredSourceSearch(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'external_documents') || !tableExists(sqlite, 'keep_import_items')) return;
  for (const statement of STORED_SOURCE_SEARCH_SCHEMA) sqlite.exec(statement);
  sqlite.exec(`INSERT INTO stored_source_search ${EXTERNAL_ROWS_SQL}`);
  sqlite.exec(`INSERT INTO stored_source_search ${REMOVED_ROWS_SQL}`);
  sqlite.exec(`INSERT INTO stored_import_locators ${STORED_IMPORT_ROWS_SQL}`);
}
