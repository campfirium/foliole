import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { SYNC_PACK_DEPENDENCY_MAX_BYTES, SYNC_PACK_DEPENDENCY_MAX_ROWS } from '../../lib/core/sync/syncPackDependencyTransfer.js';
import type { SyncPackFactClaims } from '../../lib/core/sync/syncPackFactPresence.js';
import { SYNC_PACK_NODE_VERSION_COLUMNS } from '../../lib/core/sync/syncPackNodeVersions.js';

export type SyncPackDependencyTable = 'node_sync_versions' | 'node_sync_version_parents' | 'review_log';

export interface SyncPackDependencyPosition {
  key: string;
  ordinal: number;
}

export interface SyncPackDependencyBudget {
  rows: number;
  payloadBytes: number;
}

const REVIEW_COLUMNS = ['id', 'op_id', 'host_name', 'node_id', 'grade', 'scheduler_version',
  'reviewed_at', 'due_before', 'stability_before', 'difficulty_before',
  'due_after', 'stability_after', 'difficulty_after'];

const LINEAGE = `WITH RECURSIVE lineage(version_id) AS (
  SELECT current_version_id FROM nodes WHERE id IN (SELECT value FROM json_each(?))
    AND current_version_id IS NOT NULL
  UNION
  SELECT coalesce(parent.parent_version_id, version.parent_version_id)
  FROM lineage JOIN node_sync_versions version ON version.version_id = lineage.version_id
  LEFT JOIN node_sync_version_parents parent ON parent.version_id = version.version_id
  WHERE coalesce(parent.parent_version_id, version.parent_version_id) IS NOT NULL
)`;

function dependencyQuery(table: SyncPackDependencyTable) {
  if (table === 'review_log') return {
    prefix: '', from: 'review_log row', scope: 'row.node_id = ?',
    key: 'row.op_id', ordinal: '-1', columns: REVIEW_COLUMNS
  };
  return table === 'node_sync_versions' ? {
    prefix: LINEAGE, from: 'node_sync_versions row',
    scope: 'row.version_id IN (SELECT version_id FROM lineage)',
    key: 'row.version_id', ordinal: '-1', columns: [...SYNC_PACK_NODE_VERSION_COLUMNS]
  } : {
    prefix: LINEAGE, from: 'node_sync_version_parents row',
    scope: `row.version_id IN (SELECT version_id FROM lineage)
      AND row.parent_version_id IN (SELECT version_id FROM lineage)`,
    key: 'row.version_id', ordinal: 'row.ordinal',
    columns: ['version_id', 'parent_version_id', 'ordinal']
  };
}

/** Read lengths before payloads; the stable view and table key define continuation. */
export function readSyncPackDependencyPage(driver: DatabaseDriver, args: {
  table: SyncPackDependencyTable;
  objectId: string;
  nodeIds?: string[];
  after?: SyncPackDependencyPosition;
  budget: SyncPackDependencyBudget;
  claims?: SyncPackFactClaims;
  claimDatabase?: boolean;
}) {
  const { budget, table, objectId, after } = args;
  if (![budget.rows, budget.payloadBytes].every((value) => Number.isSafeInteger(value) && value > 0) ||
      budget.rows > SYNC_PACK_DEPENDENCY_MAX_ROWS || budget.payloadBytes > SYNC_PACK_DEPENDENCY_MAX_BYTES) {
    throw new Error('sync_pack_dependency_budget_invalid');
  }
  if (!['node_sync_versions', 'node_sync_version_parents', 'review_log'].includes(table)) {
    throw new Error('sync_pack_dependency_table_invalid');
  }
  const query = dependencyQuery(table);
  const held = table === 'node_sync_versions' ? args.claims?.versions :
    table === 'review_log' ? args.claims?.reviews : args.claims?.parents;
  const factKey = table === 'node_sync_version_parents'
    ? 'json_array(row.version_id, row.parent_version_id, row.ordinal)' : query.key;
  const knownFilter = args.claimDatabase
    ? `NOT EXISTS (SELECT 1 FROM fact_claims.known_facts known
       WHERE known.kind = ? AND known.fact_key = ${factKey})`
    : `${factKey} NOT IN (SELECT value FROM json_each(?))`;
  const kind = table === 'node_sync_versions' ? 'versions' :
    table === 'node_sync_version_parents' ? 'parents' : 'reviews';
  const json = `json_object(${query.columns.map((column) => `'${column}', row.${column}`).join(', ')})`;
  const lengths = driver.queryAll<{ row_key: string; ordinal: number; payload_bytes: number }>(
    `${query.prefix} SELECT ${query.key} AS row_key, ${query.ordinal} AS ordinal,
       length(CAST(${json} AS BLOB)) AS payload_bytes FROM ${query.from}
     WHERE ${query.scope} AND ${knownFilter}
       AND (? IS NULL OR ${query.key} > ? OR
       (${query.key} = ? AND ${query.ordinal} > ?))
     ORDER BY row_key, ordinal LIMIT ?`,
    [table === 'review_log' ? objectId : JSON.stringify(args.nodeIds ?? [objectId]),
      args.claimDatabase ? kind : JSON.stringify(held ?? []),
      after?.key ?? null, after?.key ?? null, after?.key ?? null,
      after?.ordinal ?? -1, budget.rows + 1]
  );
  const rows: { position: SyncPackDependencyPosition; payload: DatabaseRow; json: string }[] = [];
  let payloadBytes = 0;
  for (const row of lengths) {
    if (rows.length === budget.rows || payloadBytes + row.payload_bytes > budget.payloadBytes) break;
    const payload = driver.queryOne<{ payload_json: string }>(
      `SELECT ${json} AS payload_json FROM ${query.from}
       WHERE ${query.key} = ? AND ${query.ordinal} = ?`, [row.row_key, row.ordinal]);
    if (!payload || Buffer.byteLength(payload.payload_json) !== row.payload_bytes) {
      throw new Error('sync_pack_dependency_source_changed');
    }
    rows.push({ position: { key: row.row_key, ordinal: row.ordinal },
      payload: JSON.parse(payload.payload_json) as DatabaseRow, json: payload.payload_json });
    payloadBytes += row.payload_bytes;
  }
  if (lengths.length && !rows.length) throw new Error('sync_pack_dependency_row_exceeds_budget');
  return { rows, payloadBytes, next: rows.at(-1)?.position ?? after ?? null,
    complete: rows.length === lengths.length };
}
