import { COMPANION_CONTENT_SNAPSHOT_SQL } from '../../../../../../lib/core/database/companionContentSnapshotQuery';
import { COMPANION_SNAPSHOT_NODE_QUERY, COMPANION_WORKSPACE_DISPLAY_NODE_QUERY } from '../../../../../../lib/core/database/companionSnapshotNodeQuery';
import type { DbPort, DbRow } from '../../../../../../lib/core/sync/dbPort';

const definition = COMPANION_SNAPSHOT_NODE_QUERY;
const columns = definition.columns.map(column => column.source);
const statement = `SELECT json_array(${columns.map(column => `"${column}"`).join(', ')}) AS packed
  FROM (${definition.sql})`;
const contentStatement = `SELECT json_array(${columns.map(column => `"${column}"`).join(', ')}) AS packed
  FROM (${COMPANION_CONTENT_SNAPSHOT_SQL})`;

export async function loadCompanionSnapshotNodeRows(db: DbPort, hostName: string, contentNodeIds?: readonly string[], exact = false): Promise<DbRow[]> {
  // Avoid repeating the directory schema thousands of times across the native bridge.
  const ids = contentNodeIds ? JSON.stringify(contentNodeIds) : null;
  const scoped = exact ? contentStatement.replace(' OR parent_id IN (SELECT value FROM json_each(?))', '') : contentStatement;
  const rows = await db.query(`${ids ? scoped : statement} ORDER BY created_at ASC, id ASC`,
    ids ? exact ? [ids, hostName] : [ids, ids, hostName] : [hostName]);
  return decodeRows(rows, columns);
}

export async function loadCompanionWorkspaceDisplayNodeRows(db: DbPort, hostName: string): Promise<DbRow[]> {
  const display = COMPANION_WORKSPACE_DISPLAY_NODE_QUERY;
  const columns = display.columns.map(column => column.source);
  const sql = `SELECT json_array(${columns.map(column => `"${column}"`).join(', ')}) AS packed
    FROM (${display.sql}) ORDER BY created_at ASC, id ASC`;
  return decodeRows(await db.query(sql, [hostName]), columns);
}

function decodeRows(rows: DbRow[], columns: string[]): DbRow[] {
  return rows.map(row => {
    if (typeof row.packed !== 'string') throw new Error('workspace_snapshot_row_invalid');
    const values: unknown = JSON.parse(row.packed);
    if (!Array.isArray(values) || values.length !== columns.length) {
      throw new Error('workspace_snapshot_row_invalid');
    }
    const decoded: DbRow = {};
    let index = 0;
    for (const column of columns) decoded[column] = values[index++];
    return decoded;
  });
}
