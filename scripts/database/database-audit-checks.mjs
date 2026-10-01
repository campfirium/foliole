import { getNumber } from '../sqlite/search-index-size-report-sql.mjs';

export function quote(name) {
  return `"${name.replaceAll('"', '""')}"`;
}

export function columns(db, table) {
  return db.prepare(`PRAGMA table_info(${quote(table)})`).all().map((row) => row.name);
}

export function readAuditChecks(db, tables, selected = null) {
  const results = {};
  const has = (table, ...names) => tables.includes(table)
    && names.every((name) => columns(db, table).includes(name));
  const count = (name, applicable, sql) => {
    if (selected && !selected.some((table) => sql.includes(table))) return;
    results[name] = applicable ? { status: 'measured', rows: getNumber(db, sql) }
      : { status: 'not-applicable' };
  };
  count('missingParent', has('nodes', 'parent_id', 'id'),
    `SELECT COUNT(*) FROM nodes n WHERE parent_id IS NOT NULL
     AND NOT EXISTS(SELECT 1 FROM nodes p WHERE p.id=n.parent_id)`);
  count('missingCurrentVersion', has('nodes', 'current_version_id') && has('node_sync_versions', 'version_id'),
    `SELECT COUNT(*) FROM nodes n WHERE current_version_id IS NOT NULL
     AND NOT EXISTS(SELECT 1 FROM node_sync_versions v WHERE v.version_id=n.current_version_id)`);
  for (const table of tables) {
    if (!has(table, 'node_id') || !has('nodes', 'id') || table === 'node_sync_tombstones') continue;
    count(`${table}.missingNode`, true, `SELECT COUNT(*) FROM ${quote(table)} t
      WHERE node_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM nodes n WHERE n.id=t.node_id)`);
  }
  count('importCacheDuplicatePreview', has('keep_import_item_cache', 'content', 'content_preview'),
    `SELECT COUNT(*) FROM keep_import_item_cache WHERE content IS NOT NULL
     AND content_preview IS NOT NULL AND content=content_preview`);
  count('importCacheMissingItem', has('keep_import_item_cache', 'rule_id', 'source_path')
    && has('keep_import_items', 'rule_id', 'source_path'),
    `SELECT COUNT(*) FROM keep_import_item_cache c WHERE NOT EXISTS(
      SELECT 1 FROM keep_import_items i WHERE i.rule_id=c.rule_id AND i.source_path=c.source_path)`);
  count('missingBodyData', has('nodes', 'body_blob_hash') && has('content_blob_data', 'hash'),
    `SELECT COUNT(*) FROM nodes n WHERE body_blob_hash IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM content_blob_data b WHERE b.hash=n.body_blob_hash)`);
  // Version references and remote manifests are legitimate owners; no deletion inference.
  const owners = ['nodes', 'external_documents', 'node_sync_versions']
    .filter((table) => has(table, 'body_blob_hash'))
    .map((table) => `SELECT body_blob_hash AS hash FROM ${quote(table)} WHERE body_blob_hash IS NOT NULL`);
  count('bodyDataWithoutDirectOwner', has('content_blob_data', 'hash') && owners.length > 0,
    `SELECT COUNT(*) FROM content_blob_data b WHERE b.hash NOT IN (${owners.join(' UNION ')})`);
  count('dependencyRowsWithoutTransfer', has('sync_pack_dependency_rows', 'group_id', 'peer_id', 'source_view_id', 'object_type', 'object_id')
    && has('sync_pack_dependency_transfers', 'group_id', 'peer_id', 'source_view_id', 'object_type', 'object_id'),
    `SELECT COUNT(*) FROM sync_pack_dependency_rows r WHERE NOT EXISTS(SELECT 1 FROM sync_pack_dependency_transfers t
      WHERE t.group_id=r.group_id AND t.peer_id=r.peer_id AND t.source_view_id=r.source_view_id
      AND t.object_type=r.object_type AND t.object_id=r.object_id)`);
  return results;
}
