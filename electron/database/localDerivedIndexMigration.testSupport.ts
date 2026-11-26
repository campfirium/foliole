import type Database from 'better-sqlite3';

import { DAILY_FLOW_LEARNING_TRIGGERS } from '../../lib/core/database/dailyFlowSchema.js';

type Sqlite = Database.Database;

const NEW_OBJECTS = `SELECT type, name FROM sqlite_master WHERE name LIKE 'daily_flow_dirty%'
  OR name LIKE 'node_sync_state_backfill%' OR name = 'idx_keep_import_items_last_node'
  OR name LIKE 'daily_flow_node_re%' ORDER BY type = 'table'`;

/** Puts a current library back to the shape version `version` shipped, before the local derived indexes. */
export function restorePreLocalDerivedIndexSchema(sqlite: Sqlite, version: number) {
  sqlite.transaction(() => {
    for (const { type, name } of sqlite.prepare(NEW_OBJECTS).all() as { type: string; name: string }[]) {
      sqlite.exec(`DROP ${type.toUpperCase()} IF EXISTS ${name}`);
    }
    for (const sql of DAILY_FLOW_LEARNING_TRIGGERS) sqlite.exec(sql);
    sqlite.exec('ALTER TABLE daily_flow_state DROP COLUMN scope_complete');
    sqlite.pragma(`user_version = ${version}`);
  })();
}

/** Every schema object, with tables compared by columns so an added column matches a declared one. */
export function readSchemaShape(sqlite: Sqlite) {
  const rows = sqlite.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_master
    WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`).all() as { type: string; name: string; sql: string | null }[];
  return rows.map(row => row.type === 'table'
    ? { type: row.type, name: row.name, columns: sqlite.prepare(`SELECT name, type, "notnull", dflt_value, pk
      FROM pragma_table_info(?) ORDER BY name`).all(row.name) }
    : { type: row.type, name: row.name, sql: row.sql?.replace(/\s+/gu, ' ') ?? null });
}
