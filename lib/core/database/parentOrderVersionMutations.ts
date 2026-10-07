import { createOpaqueVersionRef } from '../sync/opaqueSyncRefs.js';
import { publishParentOrderPositionWithDriver } from '../sync/parentOrderMemberPosition.js';
import { parentOrderFactStateStatement } from '../sync/syncParentOrderFact.js';
import { PARENT_ORDER_BASELINE_TIME,
  parentOrderBaselineVersionId } from '../sync/syncParentOrderVersionStore.js';

import type { DatabaseDriver, DatabaseRow } from './driver.js';

interface HeadRow extends DatabaseRow {
  child_ids_json: string;
  version_id: string;
}

function saveBaseline(driver: DatabaseDriver, parentId: string,
  order: readonly string[]) {
  const id = parentOrderBaselineVersionId(parentId, order);
  const json = JSON.stringify(order);
  driver.execute(`INSERT OR IGNORE INTO parent_order_versions
    (version_id, parent_id, kind, child_ids_json, parent_version_ids_json, created_at)
    VALUES (?, ?, 'baseline', ?, '[]', ?)`, [id, parentId, json, PARENT_ORDER_BASELINE_TIME]);
  const existing = driver.queryOne<{ parent_id: string; kind: string; child_ids_json: string }>(
    `SELECT parent_id, kind, child_ids_json FROM parent_order_versions WHERE version_id = ?`, [id]);
  if (existing?.parent_id !== parentId || existing.kind !== 'baseline' ||
      existing.child_ids_json !== json) throw new Error('sync_parent_order_fact_collision');
  const state = parentOrderFactStateStatement(parentId, { versionId: id,
    kind: 'baseline', order, parentVersionIds: [] }, PARENT_ORDER_BASELINE_TIME);
  driver.execute(state.sql, state.params);
  return id;
}

/** Record a local order edit while preserving any legacy or v15-received current snapshot. */
export function recordLocalParentOrderVersion(driver: DatabaseDriver, args: {
  before: readonly string[];
  createdAt: string;
  kind: 'membership' | 'user';
  order: readonly string[];
  parentId: string;
}) {
  const [head] = driver.queryAll<HeadRow>(`SELECT head.version_id, version.child_ids_json
    FROM parent_order_heads head JOIN parent_order_versions version
      ON version.version_id = head.version_id WHERE head.parent_id = ?`, [args.parentId]);
  const beforeJson = JSON.stringify(args.before);
  const parentVersionId = head?.child_ids_json === beforeJson ? head.version_id :
    saveBaseline(driver, args.parentId, args.before);
  const id = createOpaqueVersionRef(globalThis.crypto.randomUUID());
  driver.execute(`INSERT INTO parent_order_versions
    (version_id, parent_id, kind, child_ids_json, parent_version_ids_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`, [id, args.parentId, args.kind,
    JSON.stringify(args.order), JSON.stringify([parentVersionId]), args.createdAt]);
  const state = parentOrderFactStateStatement(args.parentId, { versionId: id,
    kind: args.kind, order: args.order, parentVersionIds: [parentVersionId] }, args.createdAt);
  driver.execute(state.sql, state.params);
  driver.execute(`INSERT INTO parent_order_heads (parent_id, version_id) VALUES (?, ?)
    ON CONFLICT(parent_id) DO UPDATE SET version_id = excluded.version_id`, [args.parentId, id]);
  publishParentOrderPositionWithDriver(driver, args.parentId);
  return id;
}
