import { ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS } from '../../../../../../lib/core/database/androidCompanionNodeResourceQueryDefinitions';
import { COMPANION_CONTENT_SNAPSHOT_SQL } from '../../../../../../lib/core/database/companionContentSnapshotQuery';
import type { DbPort, DbRow } from '../../../../../../lib/core/sync/dbPort';

const definition = ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS.workspaceSnapshotNodes;
const columns = definition.columns.map(column => column.source);
const statement = `SELECT json_array(${columns.map(column => `"${column}"`).join(', ')}) AS packed
  FROM (${definition.sql})`;
const contentStatement = `SELECT json_array(${columns.map(column => `"${column}"`).join(', ')}) AS packed
  FROM (${COMPANION_CONTENT_SNAPSHOT_SQL})`;

export async function loadCompanionSnapshotNodeRows(db: DbPort, hostName: string, contentNodeIds?: readonly string[]): Promise<DbRow[]> {
  // Avoid repeating the directory schema thousands of times across the native bridge.
  const ids = contentNodeIds ? JSON.stringify(contentNodeIds) : null;
  const rows = await db.query(`${ids ? contentStatement : statement} ORDER BY created_at ASC, id ASC`,
    ids ? [ids, ids, hostName] : [hostName]);
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
