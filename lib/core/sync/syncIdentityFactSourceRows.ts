import type { DbRow } from './dbPort.js';
import type { SyncIdentityFactTransfer } from './syncIdentityFactTransfer.js';
import { syncIdentityFactKey } from './syncIdentityFactTransfer.js';
import { SYNC_PACK_NODE_VERSION_COLUMNS } from './syncPackNodeVersions.js';

export const IDENTITY_REVIEW_COLUMNS = ['id', 'op_id', 'host_name', 'node_id', 'grade',
  'scheduler_version', 'reviewed_at', 'due_before', 'stability_before', 'difficulty_before',
  'due_after', 'stability_after', 'difficulty_after'] as const;

export function syncIdentityFactSourceQuery(nodeId: string, facts: SyncIdentityFactTransfer,
  schema = 'main') {
  if (!/^[a-z][a-z0-9_]*$/u.test(schema) || facts.section === 'head') {
    throw new Error('sync_identity_fact_request_invalid');
  }
  const columns = facts.section === 'versions' ? SYNC_PACK_NODE_VERSION_COLUMNS :
    facts.section === 'parents' ? ['version_id', 'parent_version_id', 'ordinal'] : IDENTITY_REVIEW_COLUMNS;
  const table = facts.section === 'versions' ? 'node_sync_versions' :
    facts.section === 'parents' ? 'node_sync_version_parents' : 'review_log';
  const key = facts.section === 'reviews' ? 'op_id' : 'version_id';
  let where = facts.section === 'parents' ? `version_id IN (SELECT version_id
    FROM ${schema}.node_sync_versions WHERE object_id = ?)` :
    `${facts.section === 'reviews' ? 'node_id' : 'object_id'} = ?`;
  const params: Array<string | number> = [nodeId];
  if (facts.after !== null) {
    if (facts.section === 'parents') {
      const tuple: unknown = JSON.parse(facts.after);
      if (!Array.isArray(tuple) || tuple.length !== 3 || typeof tuple[0] !== 'string' ||
          !Number.isSafeInteger(tuple[1]) || typeof tuple[2] !== 'string') {
        throw new Error('sync_identity_fact_request_invalid');
      }
      where += ' AND (version_id, ordinal, parent_version_id) > (?, ?, ?)';
      params.push(tuple[0], tuple[1], tuple[2]);
    } else { where += ` AND ${key} > ?`; params.push(facts.after); }
  }
  params.push(facts.limit + 1);
  const order = facts.section === 'parents' ? 'version_id, ordinal, parent_version_id' : key;
  const suffix = `FROM ${schema}.${table} WHERE ${where} ORDER BY ${order} LIMIT ?`;
  const json = `json_object(${columns.flatMap((column) => [`'${column}'`, column]).join(', ')})`;
  return { table, columns, sql: `SELECT ${columns.join(', ')} ${suffix}`,
    lengthsSql: `SELECT length(CAST(${json} AS BLOB)) AS payload_bytes ${suffix}`, params };
}

export function selectSyncIdentityFactRowCount(lengths: Array<{ payload_bytes: number }>, limit: number) {
  let bytes = 0;
  let count = 0;
  for (const row of lengths.slice(0, limit)) {
    if (row.payload_bytes > 2 * 1024 * 1024 && count === 0) {
      throw new Error('sync_identity_fact_row_over_budget');
    }
    if (bytes + row.payload_bytes > 2 * 1024 * 1024) break;
    bytes += row.payload_bytes;
    count += 1;
  }
  return count;
}

export function boundSyncIdentityFactRows<T extends DbRow>(rows: T[], facts: SyncIdentityFactTransfer, hasMore = rows.length > facts.limit) {
  const selected: T[] = [];
  let bytes = 0;
  for (const row of rows.slice(0, facts.limit)) {
    const size = new TextEncoder().encode(JSON.stringify(row)).length;
    if (bytes + size > 2 * 1024 * 1024) {
      if (!selected.length) throw new Error('sync_identity_fact_row_over_budget');
      break;
    }
    selected.push(row);
    bytes += size;
  }
  const tail = hasMore || rows.length > selected.length ?
    syncIdentityFactKey(facts.section, selected.at(-1)!) : null;
  return { rows: selected, tail: { nextAfter: tail } };
}
