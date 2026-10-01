import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { hashText } from '../../lib/core/sync/syncNodeResolution.js';
import { describeVersionFact, type SyncPackFactIndex, type SyncPackFactPage,
  type SyncParentFact } from '../../lib/core/sync/syncPackFactPresence.js';
import { assertValidNodeVersionSnapshot } from '../../lib/core/sync/syncPackNodeVersions.js';
import type { SyncPackReviewLogRecord } from '../../lib/core/sync/syncPackReviewLogExecutor.js';

import type { DesktopSyncPackFactWindow } from './syncPackFactWindow.js';

export type { DesktopSyncPackFactWindow } from './syncPackFactWindow.js';

export interface SyncPackFactPosition {
  kind: 'versions' | 'parents' | 'reviews';
  key: string;
  ordinal: number;
}

const MAX_ROWS = 128;
const MAX_BYTES = 256 * 1024;
const MAX_SOURCE_ROW_BYTES = 2 * 1024 * 1024;
const KINDS = ['versions', 'parents', 'reviews'] as const;
const REVIEW_COLUMNS = ['id', 'op_id', 'host_name', 'node_id', 'grade', 'scheduler_version',
  'reviewed_at', 'due_before', 'stability_before', 'difficulty_before',
  'due_after', 'stability_after', 'difficulty_after'];
const PRELUDE = `WITH RECURSIVE changed AS (
  SELECT object_type, object_id FROM sync_object_state state
  WHERE state_seq > ? AND state_seq <= ? AND (deleted_at IS NULL OR object_type = 'node')
    AND (object_type <> 'node_reading' OR EXISTS (
      SELECT 1 FROM node_reading reading JOIN nodes node ON node.id = reading.node_id
      WHERE reading.node_id = state.object_id AND node.deleted_at IS NULL))
), pack_nodes(id) AS (
  SELECT object_id FROM changed WHERE object_type IN
    ('node', 'node_open_state', 'node_reading', 'node_review', 'parent_child_order')
  UNION SELECT node.parent_id FROM nodes node JOIN pack_nodes pack ON pack.id = node.id
    WHERE node.parent_id IS NOT NULL
), lineage(version_id) AS (
  SELECT version.version_id FROM node_sync_versions version JOIN pack_nodes pack ON pack.id = version.object_id
  UNION SELECT coalesce(parent.parent_version_id, version.parent_version_id)
    FROM lineage JOIN node_sync_versions version ON version.version_id = lineage.version_id
    LEFT JOIN node_sync_version_parents parent ON parent.version_id = version.version_id
    WHERE coalesce(parent.parent_version_id, version.parent_version_id) IS NOT NULL
)`;

const QUERIES = {
  versions: { table: 'node_sync_versions', key: 'version_id', ordinal: '-1',
    scope: 'version_id IN (SELECT version_id FROM lineage)',
    bytes: `length(CAST(coalesce(body_text, '') AS BLOB)) + length(CAST(snapshot_json AS BLOB))
      + length(CAST(json_remove(snapshot_json, '$.content') AS BLOB))`,
    columns: `version_id, object_id, parent_version_id, host_name, created_at, content_hash,
      body_text, snapshot_json, json_remove(snapshot_json, '$.content') AS snapshot_metadata` },
  parents: { table: 'node_sync_version_parents', key: 'version_id', ordinal: 'ordinal',
    scope: 'version_id IN (SELECT version_id FROM lineage) AND parent_version_id IN (SELECT version_id FROM lineage)',
    bytes: 'length(CAST(version_id AS BLOB)) + length(CAST(parent_version_id AS BLOB)) + 32',
    columns: 'version_id, parent_version_id, ordinal' },
  reviews: { table: 'review_log', key: 'op_id', ordinal: '-1',
    scope: "node_id IN (SELECT object_id FROM changed WHERE object_type = 'node_review')",
    bytes: `length(CAST(json_object(${REVIEW_COLUMNS.map((column) => `'${column}', ${column}`).join(', ')}) AS BLOB))`,
    columns: REVIEW_COLUMNS.join(', ') }
} as const;

/** The driver must belong to the stable view used for every page in this fact round. */
export function readDesktopSyncPackFactPage(driver: DatabaseDriver, window: DesktopSyncPackFactWindow,
  after?: SyncPackFactPosition) {
  if (!after) assertFactLineage(driver, window);
  const facts: SyncPackFactPage = { versions: [], parents: [], reviews: [] };
  let bytes = 0;
  let count = 0;
  let next = after;
  const start = after ? KINDS.indexOf(after.kind) : 0;
  if (start < 0) throw new Error('sync_pack_fact_position_invalid');
  for (const kind of KINDS.slice(start)) {
    const rows = factLengths(driver, window, kind, after?.kind === kind ? after : undefined);
    for (const row of rows) {
      if (count === MAX_ROWS) return describePage(window, facts, next!, false);
      if (row.bytes > MAX_SOURCE_ROW_BYTES) throw new Error('sync_pack_fact_row_exceeds_budget');
      const fact = loadFact(driver, kind, row.key, row.ordinal);
      const size = Buffer.byteLength(JSON.stringify(fact));
      if (bytes + size > MAX_BYTES) {
        if (count === 0) throw new Error('sync_pack_fact_row_exceeds_budget');
        return describePage(window, facts, next!, false);
      }
      if (kind === 'versions') facts.versions.push(fact as SyncPackFactPage['versions'][number]);
      else if (kind === 'parents') facts.parents.push(fact as SyncParentFact);
      else facts.reviews.push(fact as SyncPackReviewLogRecord);
      bytes += size;
      count++;
      next = { kind, key: row.key, ordinal: row.ordinal };
    }
  }
  return describePage(window, facts, next ?? null, true);
}

function factLengths(driver: DatabaseDriver, window: DesktopSyncPackFactWindow,
  kind: SyncPackFactPosition['kind'], after?: SyncPackFactPosition) {
  const query = QUERIES[kind];
  return driver.queryAll<{ key: string; ordinal: number; bytes: number }>(
    `${PRELUDE} SELECT ${query.key} AS key, ${query.ordinal} AS ordinal, ${query.bytes} AS bytes
     FROM ${query.table} WHERE ${query.scope} AND (? IS NULL OR ${query.key} > ?
       OR (${query.key} = ? AND ${query.ordinal} > ?)) ORDER BY key, ordinal LIMIT ?`,
    [window.fromStateSeq, window.toStateSeq, after?.key ?? null, after?.key ?? null,
      after?.key ?? null, after?.ordinal ?? -1, MAX_ROWS + 1]);
}

function loadFact(driver: DatabaseDriver, kind: SyncPackFactPosition['kind'], key: string, ordinal: number) {
  const query = QUERIES[kind];
  const row = driver.queryOne(`SELECT ${query.columns} FROM ${query.table}
    WHERE ${query.key} = ? AND ${query.ordinal} = ?`, [key, ordinal]);
  if (!row) throw new Error('sync_pack_fact_source_changed');
  if (kind !== 'versions') return row;
  const version = row as Parameters<typeof describeVersionFact>[0];
  assertValidNodeVersionSnapshot(version);
  return describeVersionFact(version);
}

function assertFactLineage(driver: DatabaseDriver, window: DesktopSyncPackFactWindow) {
  const params = [window.fromStateSeq, window.toStateSeq];
  const invalidHead = driver.queryOne(`${PRELUDE} SELECT node.id FROM nodes node
    JOIN pack_nodes pack ON pack.id = node.id
    LEFT JOIN node_sync_versions version ON version.version_id = node.current_version_id
    WHERE node.current_version_id IS NOT NULL AND
      (version.version_id IS NULL OR version.object_id <> node.id) LIMIT 1`, params);
  if (invalidHead) throw new Error('sync_pack_node_version_missing_or_mismatched');
  const crossObject = driver.queryOne(`${PRELUDE} SELECT version.version_id FROM lineage
    JOIN node_sync_versions version ON version.version_id = lineage.version_id
    LEFT JOIN node_sync_version_parents edge ON edge.version_id = version.version_id
    JOIN node_sync_versions parent ON parent.version_id = coalesce(edge.parent_version_id, version.parent_version_id)
    WHERE version.object_id <> parent.object_id LIMIT 1`, params);
  if (crossObject) throw new Error('sync_pack_node_version_cross_object');
}

function describePage(window: DesktopSyncPackFactWindow, facts: SyncPackFactPage,
  next: SyncPackFactPosition | null, complete: boolean) {
  const identity = { from_state_seq: window.fromStateSeq, to_state_seq: window.toStateSeq,
    frontier_state_seq: window.frontierStateSeq, source_epoch: window.sourceEpoch, ...facts };
  const index: SyncPackFactIndex = { ...identity, index_id: hashText(JSON.stringify(identity)) };
  return { index, next, complete };
}
