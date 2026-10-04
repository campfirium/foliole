import Database from 'better-sqlite3';

import type { DbPort, DbRow, DbValue } from '../../lib/core/sync/dbPort.js';
import { PACK_SCHEMA } from '../../lib/core/sync/syncPackSchema.js';

const TABLES = PACK_SCHEMA.map((sql) => sql.match(/CREATE TABLE (\w+)/u)![1]!);
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;

/** Refill one disposable attached pack from verified page bytes inside the restore transaction. */
export async function loadDesktopSyncIdentityRestorePage(port: DbPort, databasePath: string) {
  const source = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    for (const table of TABLES) {
      await port.run(`DELETE FROM inc.${quote(table)}`);
      const columns = source.prepare(`PRAGMA table_info(${quote(table)})`).all() as
        Array<{ name: string }>;
      if (columns.length === 0) throw new Error('sync_identity_restore_pack_schema_invalid');
      const names = columns.map((column) => column.name);
      const insert = `INSERT INTO inc.${quote(table)} (${names.map(quote).join(', ')})
        VALUES (${names.map(() => '?').join(', ')})`;
      let offset = 0;
      for (;;) {
        const rows = source.prepare(`SELECT * FROM ${quote(table)} LIMIT 128 OFFSET ?`)
          .all(offset) as DbRow[];
        if (rows.length === 0) break;
        for (const row of rows) await port.run(insert,
          names.map((name) => row[name] as DbValue));
        offset += rows.length;
      }
    }
  } finally { source.close(); }
}
