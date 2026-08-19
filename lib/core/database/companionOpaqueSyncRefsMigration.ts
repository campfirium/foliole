import type { DbPort } from '../sync/dbPort.js';
import {
  createOpaqueEventRef,
  createOpaqueVersionRef,
  isLegacyEncodedEventRef,
  isOpaqueVersionRef,
  rewriteReferenceToken,
  rewriteStructuredRefs
} from '../sync/opaqueSyncRefs.js';

const VERSION_COLUMNS = [
  ['nodes', 'current_version_id'], ['nodes', 'anchor_source_version_id'],
  ['sync_object_state', 'current_version_id'], ['sync_change_log', 'base_version_id'],
  ['sync_change_log', 'result_version_id'], ['node_sync_versions', 'parent_version_id'],
  ['node_sync_version_parents', 'version_id'], ['node_sync_version_parents', 'parent_version_id'],
  ['node_sync_tombstones', 'version_id'], ['node_sync_tombstones', 'parent_version_id'],
  ['node_sync_conflicts', 'conflict_version_id'], ['node_sync_conflicts', 'parent_version_id'],
  ['node_text_alternatives', 'source_version_id'], ['sync_peers', 'last_seen_version_cursor']
] as const;

export async function migrateCompanionOpaqueSyncRefs(db: DbPort) {
  await db.run('PRAGMA defer_foreign_keys = ON');
  const refs = await collectRefs(db);
  for (const [table, column] of VERSION_COLUMNS) await rewriteColumn(db, table, column, refs);
  await rewriteStructuredColumns(db, refs);
  for (const [table, column] of [
    ['node_sync_versions', 'version_id'], ['review_log', 'op_id'], ['sync_change_log', 'change_id']
  ] as const) await rewriteColumn(db, table, column, refs);
  if (await tablePresent(db, 'settings')) await db.run(`DELETE FROM settings WHERE key IN (
    'desktop_node_sync_version_counter', 'desktop_node_sync_restore_incarnation'
  )`);
}

async function collectRefs(db: DbPort) {
  const refs = new Map<string, string>();
  await collect(db, 'node_sync_versions', 'version_id', refs, (value) =>
    isOpaqueVersionRef(value) ? null : createOpaqueVersionRef(globalThis.crypto.randomUUID()));
  await collect(db, 'review_log', 'op_id', refs, (value) =>
    isLegacyEncodedEventRef(value) ? createOpaqueEventRef(globalThis.crypto.randomUUID()) : null);
  await collect(db, 'sync_change_log', 'change_id', refs, (value) =>
    isLegacyEncodedEventRef(value) ? createOpaqueEventRef(globalThis.crypto.randomUUID()) : null);
  return refs;
}

async function collect(
  db: DbPort,
  table: string,
  column: string,
  refs: Map<string, string>,
  convert: (value: string) => string | null
) {
  if (!(await columnPresent(db, table, column))) return;
  const rows = await db.query<{ ref: string }>(`SELECT ${column} AS ref FROM ${table}`);
  for (const row of rows) {
    const next = convert(row.ref);
    if (next) refs.set(row.ref, next);
  }
}

async function rewriteColumn(db: DbPort, table: string, column: string, refs: ReadonlyMap<string, string>) {
  if (!(await columnPresent(db, table, column))) return;
  for (const [oldRef, newRef] of refs) {
    await db.run(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`, [newRef, oldRef]);
  }
}

async function rewriteStructuredColumns(db: DbPort, refs: ReadonlyMap<string, string>) {
  for (const [table, column, structured] of [
    ['node_sync_versions', 'snapshot_json', true], ['node_sync_tombstones', 'snapshot_json', true],
    ['node_sync_conflicts', 'snapshot_json', true], ['sync_change_log', 'payload_json', true],
    ['sync_delivery_receipts', 'operation_id', false], ['sync_delivery_receipts', 'payload_identity', false]
  ] as const) {
    if (!(await columnPresent(db, table, column))) continue;
    const rows = await db.query<{ row_id: number; value: string | null }>(
      `SELECT rowid AS row_id, ${column} AS value FROM ${table}`
    );
    for (const row of rows) {
      if (row.value === null) continue;
      const next = structured ? rewriteStructuredRefs(row.value, refs) : rewriteReferenceToken(row.value, refs);
      if (next !== row.value) await db.run(`UPDATE ${table} SET ${column} = ? WHERE rowid = ?`, [next, row.row_id]);
    }
  }
}

async function columnPresent(db: DbPort, table: string, column: string) {
  if (!(await tablePresent(db, table))) return false;
  return (await db.query(`SELECT name FROM pragma_table_info('${table}') WHERE name = ?`, [column])).length > 0;
}

async function tablePresent(db: DbPort, table: string) {
  return (await db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [table])).length > 0;
}
