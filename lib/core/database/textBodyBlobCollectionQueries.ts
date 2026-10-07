import type { DbParams } from '../sync/dbPort.js';

// Desktop-only holders are absent from companion schemas; existing holder columns are mandatory.
export const TEXT_BODY_HOLDERS = [
  ['nodes', 'body_blob_hash', 'hash'], ['external_documents', 'body_blob_hash', 'hash'],
  ['external_documents', 'content_hash', 'hash'],
  ['nodes', 'content', 'text'], ['external_documents', 'content', 'text'],
  ['node_sync_versions', 'body_text', 'text'], ['node_text_alternatives', 'body_text', 'text'],
  ['keep_import_item_cache', 'content', 'text'], ['incoming_updates', 'updated_content', 'text'],
  ['node_sync_versions', 'snapshot_json', 'json'], ['node_sync_tombstones', 'snapshot_json', 'json'],
  ['node_sync_conflicts', 'snapshot_json', 'json'], ['nodes', 'resource_references', 'json'],
  ['nodes', 'image_sources', 'json'], ['external_documents', 'reference_json', 'json'],
  ['import_sources', 'remote_import_state_json', 'json'], ['import_sources', 'remote_annotations_json', 'json'],
  ['sync_change_log', 'payload_json', 'json'], ['editor_operation_history', 'payload_json', 'json'],
  ['sync_pack_dependency_rows', 'payload_json', 'json'], ['sync_pack_known_fact_claims', 'fact_json', 'json'],
  ['sync_group_restore_page_rows', 'payload_json', 'json'], ['readwise_api_import_stage', 'payload_json', 'json'],
  ['readwise_api_reconcile_stage', 'payload_json', 'json']
] as const;

export const DELETE_BODY_DATA_SQL = 'DELETE FROM content_blob_data WHERE hash = ?';
export const DELETE_BODY_METADATA_SQL = "DELETE FROM content_blobs WHERE hash = ? AND kind = 'text_body'";

export function bodyHolderQueries(tables: Set<string>, hash: string) {
  const text = '(SELECT CAST(data AS TEXT) FROM content_blob_data WHERE hash = ?)';
  const queries = TEXT_BODY_HOLDERS.filter(([table]) => tables.has(table)).map(([table, column, kind]) => {
    let condition = `${column} = ?`;
    let params: DbParams = [hash];
    if (kind === 'text') {
      condition = `${column} = ${text} OR instr(${column}, ?) > 0`;
      params = [hash, hash];
    } else if (kind === 'json') {
      condition = `EXISTS (SELECT 1 FROM json_tree(${table}.${column}) fact
        WHERE (fact.type = 'text' AND (fact.value = ${text} OR instr(fact.value, ?) > 0))
          OR (typeof(fact.key) = 'text' AND (fact.key = ${text} OR instr(fact.key, ?) > 0)))`;
      params = [hash, hash, hash, hash];
    }
    const payload = table === 'node_sync_versions' && kind === 'json'
      ? ` AND (body_text IS NOT NULL OR json_type(snapshot_json, '$.content') = 'text')` : '';
    return { sql: `SELECT 1 AS held FROM ${table} WHERE ${column} IS NOT NULL${payload} AND (${condition}) LIMIT 1`, params };
  });
  if (tables.has('framed_sync_outbound_holds') && tables.has('framed_sync_outbound_blob_refs')) {
    queries.push({ sql: `SELECT 1 AS held FROM framed_sync_outbound_blob_refs ref
      JOIN framed_sync_outbound_holds hold ON hold.transfer_id = ref.transfer_id
      WHERE ref.role IN (1, 5) AND lower(hex(ref.sha256)) = ? LIMIT 1`, params: [hash] });
  }
  return queries;
}
