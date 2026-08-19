import { randomUUID } from 'node:crypto';

import {
  createOpaqueEventRef,
  createOpaqueVersionRef,
  isLegacyEncodedEventRef,
  isOpaqueVersionRef,
  rewriteReferenceToken,
  rewriteStructuredRefs
} from '../sync/opaqueSyncRefs.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { columnExists, tableExists } from './numberedMigrationHelpers.js';

const VERSION_COLUMNS = [
  ['nodes', 'current_version_id'], ['nodes', 'anchor_source_version_id'],
  ['sync_object_state', 'current_version_id'], ['sync_change_log', 'base_version_id'],
  ['sync_change_log', 'result_version_id'], ['node_sync_versions', 'parent_version_id'],
  ['node_sync_version_parents', 'version_id'], ['node_sync_version_parents', 'parent_version_id'],
  ['node_sync_tombstones', 'version_id'], ['node_sync_tombstones', 'parent_version_id'],
  ['node_sync_conflicts', 'conflict_version_id'], ['node_sync_conflicts', 'parent_version_id'],
  ['node_text_alternatives', 'source_version_id'], ['sync_peers', 'last_seen_version_cursor']
] as const;

export function migrateOpaqueSyncRefs(sqlite: DatabaseMigrationTarget) {
  sqlite.exec('PRAGMA defer_foreign_keys = ON');
  const refs = collectRefs(sqlite);
  rewriteColumns(sqlite, refs);
  rewriteStructuredColumns(sqlite, refs);
  if (tableExists(sqlite, 'node_sync_versions')) rewritePrimary(sqlite, 'node_sync_versions', 'version_id', refs);
  if (tableExists(sqlite, 'review_log')) rewritePrimary(sqlite, 'review_log', 'op_id', refs);
  if (tableExists(sqlite, 'sync_change_log')) rewritePrimary(sqlite, 'sync_change_log', 'change_id', refs);
  if (tableExists(sqlite, 'settings')) sqlite.exec(`DELETE FROM settings WHERE key IN (
    'desktop_node_sync_version_counter', 'desktop_node_sync_restore_incarnation'
  )`);
}

function collectRefs(sqlite: DatabaseMigrationTarget) {
  const refs = new Map<string, string>();
  collect(sqlite, 'node_sync_versions', 'version_id', refs, (value) =>
    isOpaqueVersionRef(value) ? null : createOpaqueVersionRef(randomUUID()));
  collect(sqlite, 'review_log', 'op_id', refs, (value) =>
    isLegacyEncodedEventRef(value) ? createOpaqueEventRef(randomUUID()) : null);
  collect(sqlite, 'sync_change_log', 'change_id', refs, (value) =>
    isLegacyEncodedEventRef(value) ? createOpaqueEventRef(randomUUID()) : null);
  return refs;
}

function collect(
  sqlite: DatabaseMigrationTarget,
  table: string,
  column: string,
  refs: Map<string, string>,
  convert: (value: string) => string | null
) {
  if (!tableExists(sqlite, table) || !columnExists(sqlite, table, column)) return;
  const rows = sqlite.prepare(`SELECT ${column} AS ref FROM ${table}`).all() as Array<{ ref: string }>;
  for (const row of rows) {
    const next = convert(row.ref);
    if (next) refs.set(row.ref, next);
  }
}

function rewriteColumns(sqlite: DatabaseMigrationTarget, refs: ReadonlyMap<string, string>) {
  for (const [table, column] of VERSION_COLUMNS) {
    if (!tableExists(sqlite, table) || !columnExists(sqlite, table, column)) continue;
    const update = sqlite.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`);
    for (const [oldRef, newRef] of refs) update.run(newRef, oldRef);
  }
}

function rewriteStructuredColumns(sqlite: DatabaseMigrationTarget, refs: ReadonlyMap<string, string>) {
  for (const [table, column, structured] of [
    ['node_sync_versions', 'snapshot_json', true],
    ['node_sync_tombstones', 'snapshot_json', true],
    ['node_sync_conflicts', 'snapshot_json', true],
    ['sync_change_log', 'payload_json', true],
    ['sync_delivery_receipts', 'operation_id', false],
    ['sync_delivery_receipts', 'payload_identity', false]
  ] as const) rewriteTextColumn(sqlite, table, column, structured, refs);
}

function rewriteTextColumn(
  sqlite: DatabaseMigrationTarget,
  table: string,
  column: string,
  structured: boolean,
  refs: ReadonlyMap<string, string>
) {
  if (!tableExists(sqlite, table) || !columnExists(sqlite, table, column)) return;
  const rows = sqlite.prepare(`SELECT rowid AS row_id, ${column} AS value FROM ${table}`).all() as
    Array<{ row_id: number; value: string | null }>;
  const update = sqlite.prepare(`UPDATE ${table} SET ${column} = ? WHERE rowid = ?`);
  for (const row of rows) {
    if (row.value === null) continue;
    const next = structured ? rewriteStructuredRefs(row.value, refs) : rewriteReferenceToken(row.value, refs);
    if (next !== row.value) update.run(next, row.row_id);
  }
}

function rewritePrimary(
  sqlite: DatabaseMigrationTarget,
  table: string,
  column: string,
  refs: ReadonlyMap<string, string>
) {
  const update = sqlite.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`);
  for (const [oldRef, newRef] of refs) update.run(newRef, oldRef);
}
