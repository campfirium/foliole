import type { DbParams } from '../sync/dbPort.js';

import { TEXT_BODY_HOLDERS } from './textBodyBlobCollectionQueries.js';

const REFERENCES = [
  ['nodes', 'body_blob_hash'], ['external_documents', 'body_blob_hash'],
  ['external_documents', 'content_hash'], ['node_sync_versions', 'body_blob_hash'],
  ['node_text_alternatives', 'body_blob_hash'], ['keep_import_item_cache', 'body_blob_hash'],
  ['incoming_updates', 'body_blob_hash'], ['node_sync_tombstones', 'inline_body_hash'],
  ['node_sync_conflicts', 'inline_body_hash']
] as const;

export function chunkedBodyHolderQueries(tables: Set<string>, hash: string) {
  const queries: Array<{ sql: string; params: DbParams }> = REFERENCES
    .filter(([table]) => tables.has(table)).map(([table, column]) => ({
      sql: `SELECT 1 AS held FROM ${table} WHERE ${column} = ?${
        table === 'node_sync_versions' ? " AND body_state = 'readable'" : ''} LIMIT 1`, params: [hash]
    }));
  for (const [table, column, kind] of TEXT_BODY_HOLDERS) {
    if (kind !== 'json' || !tables.has(table)) continue;
    queries.push({ sql: `SELECT 1 AS held FROM ${table} WHERE ${column} IS NOT NULL${
      table === 'node_sync_versions' ? " AND body_state = 'readable'" : ''}
      AND EXISTS (SELECT 1 FROM json_tree(${table}.${column}) fact
        WHERE (fact.type = 'text' AND instr(fact.value, ?) > 0)
          OR (typeof(fact.key) = 'text' AND instr(fact.key, ?) > 0)) LIMIT 1`, params: [hash, hash] });
  }
  if (tables.has('framed_sync_outbound_holds') && tables.has('framed_sync_outbound_blob_refs')) {
    queries.push({ sql: `SELECT 1 AS held FROM framed_sync_outbound_blob_refs ref
      JOIN framed_sync_outbound_holds hold ON hold.transfer_id = ref.transfer_id
      WHERE ref.role IN (1, 5) AND lower(hex(ref.sha256)) = ? LIMIT 1`, params: [hash] });
  }
  if (tables.has('framed_sync_blob_pins')) queries.push({
    sql: 'SELECT 1 AS held FROM framed_sync_blob_pins WHERE role IN (1, 5) AND lower(hex(sha256)) = ? LIMIT 1',
    params: [hash]
  });
  return queries;
}

export function chunkedBodyJsonHolders(tables: Set<string>) {
  return TEXT_BODY_HOLDERS.flatMap(([table, column, kind]) => kind === 'json' && tables.has(table)
    ? [{ table, column, readableVersionsOnly: table === 'node_sync_versions' }] : []);
}
