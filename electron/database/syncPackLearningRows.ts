import type { DatabaseBindParams, DatabaseRow } from '../../lib/core/database/driver.js';

export function learningNodeIds(rows: Array<{ object_id: string; object_type: string }>) {
  return rows
    .filter((row) => row.object_type === 'node_reading' || row.object_type === 'node_review')
    .map((row) => row.object_id);
}

export function loadNodePreludeStateRows<T extends DatabaseRow & {
  object_id: string;
  object_type: string;
  state_seq: number;
}>(args: {
  isSyncStatePackRow(row: T): row is T;
  nodeIds: string[];
  placeholders(values: unknown[]): string;
  query(sql: string, params: DatabaseBindParams): T[];
  toStateSeq: number;
}) {
  const nodeIds = [...new Set(args.nodeIds)];
  if (nodeIds.length === 0) return [];
  return args.query(
    `WITH RECURSIVE node_prelude(id, parent_id) AS (
       SELECT id, parent_id FROM nodes WHERE id IN (${args.placeholders(nodeIds)})
       UNION SELECT parent.id, parent.parent_id FROM nodes parent
       INNER JOIN node_prelude child ON child.parent_id = parent.id
     )
     SELECT state.object_type, state.object_id, state.state_seq, state.content_hash,
       state.last_modified_by_host_name,
       state.updated_at, state.deleted_at
     FROM sync_object_state state
     INNER JOIN node_prelude prelude ON prelude.id = state.object_id
     WHERE state.object_type = 'node' AND state.state_seq <= ?
     ORDER BY state.state_seq ASC`,
    [...nodeIds, args.toStateSeq]
  ).filter(args.isSyncStatePackRow);
}

export function mergeStateRows<T extends { object_id: string; object_type: string; state_seq: number }>(
  changedRows: T[],
  preludeRows: T[]
) {
  const rowsByKey = new Map<string, T>();
  for (const row of [...preludeRows, ...changedRows]) {
    rowsByKey.set(`${row.object_type}:${row.object_id}`, row);
  }
  return [...rowsByKey.values()].sort((left, right) => left.state_seq - right.state_seq);
}
