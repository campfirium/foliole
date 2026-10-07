import type { DatabaseDriver } from '../database/driver.js';

import type { DbPort, DbRow } from './dbPort.js';
import { RETIRE_RESOLVED_ORDER_POSITIONS_SQL } from './parentOrderPositionRead.js';
import { planParentOrderResolution } from './syncParentOrderResolutionPlan.js';
import { planVersionBodyRetention } from './versionBodyRetentionPlan.js';

interface ArrangementRow extends DbRow {
  version_id: string;
  parent_version_ids_json: string;
  kind: 'baseline' | 'membership' | 'merge' | 'user';
  available: number;
  fingerprint: number;
}

export const PARENT_ORDER_BODY_ROWS_SQL = `SELECT version_id, kind, parent_version_ids_json,
  child_ids_json != 'null' AS available, EXISTS (SELECT 1 FROM sync_object_state state
    WHERE state.object_type = 'order_version' AND state.object_id = version_id
      AND length(state.content_hash) = 64) AS fingerprint
    FROM parent_order_versions WHERE parent_id = ?`;
const HEAD_SQL = 'SELECT version_id FROM parent_order_heads WHERE parent_id = ?';
const UNKNOWN_PEER_SQL = `SELECT 1 AS unknown FROM sync_group_devices peer
  JOIN sync_group_local_state local ON local.group_id = peer.group_id AND local.state = 'active'
  WHERE peer.state = 'active' AND peer.device_identity_key <> local.local_device_identity_key
    AND NOT EXISTS (SELECT 1 FROM parent_order_member_positions position
      WHERE position.group_id = peer.group_id AND position.device_identity_key = peer.device_identity_key
        AND position.object_id = ?) LIMIT 1`;
const POSITIONS_SQL = `SELECT position.adopted_version_id AS version_id FROM parent_order_member_positions position
  JOIN sync_group_local_state local ON local.group_id = position.group_id AND local.state = 'active'
  WHERE position.object_id = ? AND position.resolved_revision IS NULL
  UNION SELECT pending.value FROM parent_order_member_positions position
  JOIN sync_group_local_state local ON local.group_id = position.group_id AND local.state = 'active'
  JOIN json_each(position.pending_version_ids_json) pending
  WHERE position.object_id = ? AND position.resolved_revision IS NULL`;
const HELD_SQL = `SELECT ref.global_id AS version_id FROM framed_sync_outbound_fact_refs ref
  JOIN framed_sync_outbound_holds hold ON hold.transfer_id = ref.transfer_id
  JOIN framed_sync_outbound_publications publication ON publication.transfer_id = ref.transfer_id
  JOIN json_each(publication.manifest_json, '$.facts') fact
    ON json_extract(fact.value, '$.objectType') = 'order_version'
      AND json_extract(fact.value, '$.globalId') = ref.global_id
  JOIN json_each(fact.value, '$.body') field ON json_extract(field.value, '$.name') = 'payload_json'
  JOIN parent_order_versions version ON version.version_id = ref.global_id
  WHERE ref.object_type = 'order_version' AND version.parent_id = ?
    AND CASE WHEN json_extract(field.value, '$.name') = 'payload_json'
      THEN json_extract(json_extract(field.value, '$.value.value'), '$.child_ids_json') END != 'null'
  UNION SELECT json_extract(field.value, '$.value.value') FROM framed_sync_outbound_publications publication
  JOIN framed_sync_outbound_holds hold ON hold.transfer_id = publication.transfer_id,
    json_each(publication.manifest_json, '$.facts') fact, json_each(fact.value, '$.body') field
  WHERE json_extract(fact.value, '$.objectType') = 'parent_child_order'
    AND json_extract(fact.value, '$.globalId') = ?
    AND json_extract(field.value, '$.name') = 'current_version_id'`;

function plan(rows: ArrangementRow[], head: string, refs: string[], unknown: boolean) {
  const versions = rows.map((row) => ({ versionId: row.version_id,
    parentVersionIds: JSON.parse(row.parent_version_ids_json) as string[], bodyAvailable: row.available === 1 }));
  const predecessors = new Set(versions.flatMap((row) => row.parentVersionIds));
  const tips = rows.filter((row) => !predecessors.has(row.version_id)).map((row) => row.version_id);
  const keep = new Set([head, ...refs, ...tips,
    ...rows.filter((row) => !row.fingerprint || (unknown && row.available === 1)).map((row) => row.version_id)]);
  const ids = new Set(versions.map((row) => row.versionId));
  if (versions.some((row) => row.parentVersionIds.some((id) => !ids.has(id)))) {
    return { skipped: 'lineage_unproven' as const, removed: undefined };
  }
  const lineage = rows.map((row) => ({ versionId: row.version_id, kind: row.kind,
    parentVersionIds: JSON.parse(row.parent_version_ids_json) as string[] }));
  for (const tip of [head, ...tips]) {
    for (const id of planParentOrderResolution(lineage, [tip]).requiredVersionIds) keep.add(id);
  }
  return planVersionBodyRetention(versions, keep, new Set(), Number.MAX_SAFE_INTEGER, new Set([head]));
}

/** Article and arrangement bodies use the same branch/base/hold retention policy. */
export async function collectParentOrderBodies(db: DbPort, parentId: string) {
  return db.transaction(async (tx) => {
    const [head] = await tx.query<{ version_id: string }>(HEAD_SQL, [parentId]);
    if (!head) return { released: 0, skipped: 'unversioned' };
    await tx.run(RETIRE_RESOLVED_ORDER_POSITIONS_SQL, [parentId]);
    const refs = await tx.query<{ version_id: string }>(POSITIONS_SQL, [parentId, parentId]);
    const held = await tx.query<{ version_id: string }>(HELD_SQL, [parentId, parentId]);
    const result = plan(await tx.query<ArrangementRow>(PARENT_ORDER_BODY_ROWS_SQL, [parentId]),
      head.version_id, [...refs, ...held].map((row) => row.version_id),
      (await tx.query(UNKNOWN_PEER_SQL, [parentId])).length > 0);
    for (const id of result.removed ?? []) await tx.run(
      "UPDATE parent_order_versions SET child_ids_json = 'null' WHERE version_id = ?", [id]);
    return { released: result.removed?.length ?? 0, skipped: result.skipped };
  });
}

export function collectParentOrderBodiesWithDriver(driver: DatabaseDriver, parentId: string) {
  return driver.transaction(() => {
    const head = driver.queryOne<{ version_id: string }>(HEAD_SQL, [parentId]);
    if (!head) return { released: 0, skipped: 'unversioned' };
    driver.execute(RETIRE_RESOLVED_ORDER_POSITIONS_SQL, [parentId]);
    const refs = driver.queryAll<{ version_id: string }>(POSITIONS_SQL, [parentId, parentId]);
    const held = driver.queryAll<{ version_id: string }>(HELD_SQL, [parentId, parentId]);
    const result = plan(driver.queryAll<ArrangementRow>(PARENT_ORDER_BODY_ROWS_SQL, [parentId]),
      head.version_id, [...refs, ...held].map((row) => row.version_id),
      Boolean(driver.queryOne(UNKNOWN_PEER_SQL, [parentId])));
    for (const id of result.removed ?? []) driver.execute(
      "UPDATE parent_order_versions SET child_ids_json = 'null' WHERE version_id = ?", [id]);
    return { released: result.removed?.length ?? 0, skipped: result.skipped };
  });
}

export function collectAllParentOrderBodiesWithDriver(driver: DatabaseDriver) {
  for (const row of driver.queryAll<{ parent_id: string }>('SELECT parent_id FROM parent_order_heads')) {
    collectParentOrderBodiesWithDriver(driver, row.parent_id);
  }
}

/** Reconsider only arrangements referenced by this exact completed delivery. */
export async function collectDeliveredParentOrderBodies(db: DbPort, transferId: Uint8Array) {
  const rows = await db.query<{ parent_id: string }>(`SELECT DISTINCT version.parent_id
    FROM framed_sync_outbound_fact_refs ref JOIN parent_order_versions version
      ON version.version_id = ref.global_id WHERE ref.transfer_id = ? AND ref.object_type = 'order_version'
    UNION SELECT ref.global_id FROM framed_sync_outbound_fact_refs ref
      WHERE ref.transfer_id = ? AND ref.object_type = 'parent_child_order'`, [transferId, transferId]);
  for (const row of rows) await collectParentOrderBodies(db, row.parent_id);
}

export async function collectAllParentOrderBodies(db: DbPort) {
  for (const row of await db.query<{ parent_id: string }>('SELECT parent_id FROM parent_order_heads')) {
    await collectParentOrderBodies(db, row.parent_id);
  }
}
