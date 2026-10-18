import { ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS } from '../../../../../../lib/core/database/androidCompanionNodeResourceQueryDefinitions';
import type { DbPort, DbRow } from '../../../../../../lib/core/sync/dbPort';

const definition = ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS.workspaceSnapshotNodes;
const columns = definition.columns.map(column => column.source);
const statement = `SELECT json_array(${columns.map(column => `"${column}"`).join(', ')}) AS packed
  FROM (${definition.sql}) ORDER BY created_at ASC, id ASC`;

export async function loadCompanionSnapshotNodeRows(db: DbPort, hostName: string): Promise<DbRow[]> {
  // Avoid repeating the directory schema thousands of times across the native bridge.
  const rows = await db.query(statement, [hostName]);
  return rows.map(row => {
    if (typeof row.packed !== 'string') throw new Error('workspace_snapshot_row_invalid');
    const values: unknown = JSON.parse(row.packed);
    if (!Array.isArray(values) || values.length !== columns.length) {
      throw new Error('workspace_snapshot_row_invalid');
    }
    return Object.fromEntries(columns.map((column, index) => [column, values[index]]));
  });
}
