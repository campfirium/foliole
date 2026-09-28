import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import type { SyncPackFactClaims } from '../../lib/core/sync/syncPackFactPresence.js';
import { SYNC_PACK_NODE_FIELD_DEFINITIONS } from '../../lib/core/sync/syncPackNodeFields.js';

import type { SyncPackPageBudget } from './syncPackPageBudget.js';

interface PayloadSize extends DatabaseRow {
  bytes: number;
}

const INLINE_PAYLOAD_SIZE_QUERIES = [
    `SELECT COALESCE(SUM(length(CAST(a.body_text AS BLOB))), 0) AS bytes
     FROM node_text_alternatives a JOIN sync_object_state s
       ON s.object_type = 'node_text_alternative' AND s.object_id = a.alternative_id
     WHERE s.state_seq > ? AND s.state_seq <= ?`,
    `SELECT COALESCE(SUM(length(CAST(p.text AS BLOB))), 0) AS bytes
     FROM pdf_page_text p JOIN sync_object_state s
       ON s.object_type = 'pdf_page_text' AND s.object_id = p.attachment_id || ':' || p.page
     WHERE s.state_seq > ? AND s.state_seq <= ?`,
    `SELECT COALESCE(SUM(length(CAST(o.child_ids_json AS BLOB))), 0) AS bytes
     FROM parent_child_order o JOIN sync_object_state s
       ON s.object_type = 'parent_child_order' AND s.object_id = o.parent_id
     WHERE s.state_seq > ? AND s.state_seq <= ?`,
    `SELECT COALESCE(SUM(length(CAST(p.value_json AS BLOB))), 0) AS bytes
     FROM setting_records p JOIN sync_object_state s
       ON s.object_type = 'setting' AND s.object_id =
         p.scope || ':' || p.platform || ':' || p.form_factor || ':' || p.host_name || ':' || p.key
     WHERE s.state_seq > ? AND s.state_seq <= ?`,
    `SELECT COALESCE(SUM(
       COALESCE(length(CAST(i.remote_annotations_json AS BLOB)), 0) +
       COALESCE(length(CAST(i.remote_import_state_json AS BLOB)), 0)), 0) AS bytes
     FROM import_sources i JOIN sync_object_state s
       ON s.object_type = 'import_source' AND s.object_id = i.source_fingerprint
     WHERE s.state_seq > ? AND s.state_seq <= ?`,
    `SELECT COALESCE(SUM(
       COALESCE(length(CAST(f.excluded_dirs_json AS BLOB)), 0) +
       COALESCE(length(CAST(d.type_settings_json AS BLOB)), 0)), 0) AS bytes
     FROM external_search_folders f JOIN sync_object_state s
       ON s.object_type = 'external_folder' AND s.object_id = f.id
     JOIN desktop_sources d ON d.source_ref = f.source_ref
     WHERE s.state_seq > ? AND s.state_seq <= ?`
];

const NODE_TEXT_BYTES = SYNC_PACK_NODE_FIELD_DEFINITIONS
  .filter((field) => field.sql.startsWith('TEXT') && field.name !== 'content')
  .map((field) => `COALESCE(length(CAST(n.${field.name} AS BLOB)), 0)`)
  .join(' + ');

function inlinePayloadBytes(driver: DatabaseDriver, params: number[]) {
  let bytes = 0;
  for (const sql of INLINE_PAYLOAD_SIZE_QUERIES) {
    bytes += driver.queryOne<PayloadSize>(sql, params)?.bytes ?? 0;
  }
  return bytes;
}

function attachmentRows(driver: DatabaseDriver, params: number[], limit: number) {
  return driver.queryOne<{ count: number }>(
    `WITH RECURSIVE roots(id) AS (
       SELECT object_id FROM sync_object_state
       WHERE state_seq > ? AND state_seq <= ?
         AND object_type IN ('node', 'node_reading', 'node_review')
     ), lineage(id, parent_id) AS (
       SELECT n.id, n.parent_id FROM nodes n JOIN roots r ON r.id = n.id
       UNION SELECT parent.id, parent.parent_id FROM nodes parent
       JOIN lineage child ON child.parent_id = parent.id
     )
     SELECT COUNT(*) AS count FROM node_attachments a
     JOIN (SELECT DISTINCT id FROM lineage LIMIT ?) selected ON selected.id = a.node_id`,
    [...params, limit]
  )?.count ?? 0;
}

/** Rejects oversized payload sources before the ordinary JS row loader sees them. */
export function assertSyncPackPreloadBudget(driver: DatabaseDriver, fromStateSeq: number,
  toStateSeq: number, budget: SyncPackPageBudget, claims?: SyncPackFactClaims) {
  const params = [fromStateSeq, toStateSeq];
  const rows = driver.queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM sync_object_state
     WHERE state_seq > ? AND state_seq <= ?`, params
  )?.count ?? 0;
  const ancestors = driver.queryOne<{ count: number }>(
    `WITH RECURSIVE roots(id) AS (
       SELECT object_id FROM sync_object_state
       WHERE state_seq > ? AND state_seq <= ?
         AND object_type IN ('node', 'node_reading', 'node_review')
     ), lineage(id, parent_id) AS (
       SELECT n.id, n.parent_id FROM nodes n JOIN roots r ON r.id = n.id
       UNION SELECT parent.id, parent.parent_id FROM nodes parent
       JOIN lineage child ON child.parent_id = parent.id
     )
     SELECT COUNT(*) AS count FROM (SELECT id FROM lineage LIMIT ?)`,
    [...params, budget.applyRows + 1]
  )?.count ?? 0;
  if (rows + ancestors > budget.applyRows) {
    throw new Error('sync_pack_page_preflight_exceeds_budget');
  }
  const nodePayload = driver.queryOne<PayloadSize>(
    `WITH RECURSIVE roots(id) AS (
       SELECT object_id FROM sync_object_state
       WHERE state_seq > ? AND state_seq <= ?
         AND object_type IN ('node', 'node_reading', 'node_review')
     ), lineage(id, parent_id) AS (
       SELECT n.id, n.parent_id FROM nodes n JOIN roots r ON r.id = n.id
       UNION SELECT parent.id, parent.parent_id FROM nodes parent
       JOIN lineage child ON child.parent_id = parent.id
     )
     SELECT COALESCE(SUM(${NODE_TEXT_BYTES}), 0) AS bytes FROM nodes n
     JOIN (SELECT DISTINCT id FROM lineage LIMIT ?) selected ON selected.id = n.id`,
    [...params, budget.applyRows]
  )?.bytes ?? 0;
  const tombstones = driver.queryOne<PayloadSize & { rows: number }>(
    `SELECT COALESCE(SUM(length(CAST(t.snapshot_json AS BLOB))), 0) AS bytes,
       COUNT(*) AS rows FROM node_sync_tombstones t
     WHERE EXISTS (SELECT 1 FROM sync_object_state s
       WHERE s.object_type = 'node' AND s.object_id = t.node_id
         AND s.deleted_at IS NOT NULL AND s.state_seq > ? AND s.state_seq <= ?)`, params
  );
  const knownReviews = claims?.reviews ?? [];
  const reviewExclusion = knownReviews.length
    ? ` AND r.op_id NOT IN (${knownReviews.map(() => '?').join(', ')})` : '';
  const reviews = driver.queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM review_log r
     JOIN sync_object_state s ON s.object_type = 'node_review' AND s.object_id = r.node_id
     WHERE s.state_seq > ? AND s.state_seq <= ?${reviewExclusion}`, [...params, ...knownReviews]
  )?.count ?? 0;
  const attachments = attachmentRows(driver, params, budget.applyRows);
  const bytes = nodePayload + inlinePayloadBytes(driver, params) + (tombstones?.bytes ?? 0);
  const totalRows = rows + ancestors + reviews + attachments + (tombstones?.rows ?? 0);
  if (!Number.isSafeInteger(bytes) || !Number.isSafeInteger(totalRows) ||
    bytes > budget.databaseBytes || totalRows > budget.applyRows) {
    throw new Error('sync_pack_page_preflight_exceeds_budget');
  }
}
