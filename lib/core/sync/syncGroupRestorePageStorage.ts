import type { DbPort, DbRow, DbValue } from './dbPort.js';
import { PACK_SCHEMA } from './syncPackSchema.js';

const TABLES = PACK_SCHEMA.map((sql) => sql.match(/CREATE TABLE (\w+)/u)![1]!);
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;

// Store only authenticated incoming data; the receiver's library is never copied.
export async function storeRestorePage(port: DbPort, restoreId: string, after: number) {
  await port.run('DELETE FROM sync_group_restore_page_rows WHERE restore_id = ? AND from_state_seq = ?',
    [restoreId, after]);
  for (const table of TABLES) {
    let rowIndex = 0;
    for (;;) {
      const rows = await port.query(`SELECT * FROM inc.${quote(table)} LIMIT 128 OFFSET ?`, [rowIndex]);
      if (!rows.length) break;
      for (const row of rows) {
        await port.run(`INSERT INTO sync_group_restore_page_rows
          (restore_id, from_state_seq, table_name, row_index, payload_json) VALUES (?, ?, ?, ?, ?)`,
        [restoreId, after, table, rowIndex++, JSON.stringify(row)]);
      }
    }
  }
}

// Reuse the disposable incoming database while replaying pages inside one library transaction.
export async function loadStoredRestorePage(port: DbPort, restoreId: string, after: number) {
  for (const table of TABLES) {
    await port.run(`DELETE FROM inc.${quote(table)}`);
    let rowIndex = -1;
    for (;;) {
      const rows = await port.query<{ row_index: number; payload_json: string }>(
        `SELECT row_index, payload_json FROM sync_group_restore_page_rows
         WHERE restore_id = ? AND from_state_seq = ? AND table_name = ? AND row_index > ?
         ORDER BY row_index LIMIT 128`, [restoreId, after, table, rowIndex]);
      if (!rows.length) break;
      for (const stored of rows) {
        const row = JSON.parse(stored.payload_json) as DbRow;
        const columns = Object.keys(row);
        await port.run(`INSERT INTO inc.${quote(table)} (${columns.map(quote).join(', ')})
          VALUES (${columns.map(() => '?').join(', ')})`,
        columns.map((column) => row[column] as DbValue));
        rowIndex = stored.row_index;
      }
    }
  }
}
