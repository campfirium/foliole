import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { z } from 'zod';

import { NEXT_SYNC_STATE_SEQ_SQL } from '../database/syncStateSequenceSchemaStatements.js';

import type { DbPort, DbRow } from './dbPort.js';
import { ensureSyncSpecialRootNodes } from './syncPackSpecialRootApply.js';
import { loadParentOrderMembers } from './syncParentOrderMembers.js';
import { readParentOrderResolutionHistory, readParentOrderResolutionSnapshots } from './syncParentOrderResolutionRead.js';
import { resolvePlannedParentOrderHeads } from './syncParentOrderResolve.js';
import type { ParentOrderVersion } from './syncParentOrderVersionGraph.js';
import { advanceParentOrderHead, insertParentOrderVersion,
  PARENT_ORDER_BASELINE_TIME } from './syncParentOrderVersionStore.js';

interface OrderRow extends DbRow {
  child_ids_json: string;
  content_hash: string;
  deleted_at: string | null;
  parent_id: string;
  payload_json?: string | null;
  updated_at: string;
  sync_dirty: number;
  base_content_hash: string | null;
  current_version_id: string | null;
}

interface StagedOrderMerge {
  parentId: string;
  childIdsJson: string;
  contentHash: string;
  baseContentHash: string;
  version: ParentOrderVersion;
}

const orderPayload = z.object({ parent_id: z.string().min(1), child_ids_json: z.string() });
const orderIds = z.array(z.string().min(1)).refine((ids) => new Set(ids).size === ids.length);

function mergedOrderHash(parentId: string, childIdsJson: string) {
  const payload = JSON.stringify({ child_ids_json: childIdsJson, parent_id: parentId });
  return bytesToHex(sha256(new TextEncoder().encode(payload)));
}

/** Capture all direct-parent arrays before ordinary state apply replaces them. */
export async function stageSyncIdentityParentOrderMerges(port: DbPort, incomingAlias = 'inc'):
  Promise<StagedOrderMerge[]> {
  if (!/^[a-z][a-z0-9_]*$/u.test(incomingAlias)) throw new Error('sync_identity_schema_invalid');
  const incoming = await port.query<OrderRow>(`SELECT payload.object_id AS parent_id,
    payload.payload_json, state.content_hash, state.deleted_at, state.updated_at,
    state.current_version_id
    FROM ${incomingAlias}.sync_objects payload JOIN ${incomingAlias}.sync_object_state state
      ON state.object_type = payload.object_type AND state.object_id = payload.object_id
    WHERE payload.object_type = 'parent_child_order' ORDER BY payload.object_id`);
  const staged: StagedOrderMerge[] = [];
  for (const row of incoming) {
    const merge = await stageSyncIdentityParentOrderRecordMerge(port, row, incomingAlias);
    if (merge) staged.push(merge);
  }
  return staged;
}

export async function stageSyncIdentityParentOrderRecordMerge(port: DbPort,
  incoming: Pick<OrderRow, 'parent_id' | 'payload_json' | 'content_hash' | 'deleted_at' | 'current_version_id'>,
  incomingAlias = 'main'): Promise<StagedOrderMerge | null> {
  return port.transaction((tx) => stageParentOrderRecordMerge(tx, incoming, incomingAlias));
}

async function stageParentOrderRecordMerge(port: DbPort,
  incoming: Pick<OrderRow, 'parent_id' | 'payload_json' | 'content_hash' | 'deleted_at' | 'current_version_id'>,
  incomingAlias: string): Promise<StagedOrderMerge | null> {
  const parentId = incoming.parent_id;
  const [local] = await port.query<OrderRow>(`SELECT entity.parent_id, entity.child_ids_json,
    state.content_hash, state.deleted_at, state.updated_at, state.sync_dirty,
    state.base_content_hash, state.current_version_id FROM parent_child_order entity
    JOIN sync_object_state state ON state.object_type = 'parent_child_order'
      AND state.object_id = entity.parent_id WHERE entity.parent_id = ?`, [parentId]);
  if (incoming.deleted_at || local?.deleted_at) return null;
  const payload = orderPayload.parse(JSON.parse(incoming.payload_json ?? 'null'));
  if (payload.parent_id !== parentId) throw new Error('invalid_parent_child_order');
  const right = orderIds.parse(JSON.parse(payload.child_ids_json));
  const left = local ? orderIds.parse(JSON.parse(local.child_ids_json)) : [];
  if ((local && mergedOrderHash(parentId, local.child_ids_json) !== local.content_hash) ||
      mergedOrderHash(parentId, payload.child_ids_json) !== incoming.content_hash) {
    throw new Error('sync_parent_order_state_mismatch');
  }
  const headIds = [...new Set([local?.current_version_id, incoming.current_version_id]
    .filter((id): id is string => Boolean(id)))];
  if (!incoming.current_version_id || (local && !local.current_version_id)) {
    throw new Error('sync_parent_order_head_unproven');
  }
  const history = await readParentOrderResolutionHistory(port, parentId, headIds);
  for (const [headId, order] of [[local?.current_version_id, left],
    [incoming.current_version_id, right]] as const) {
    if (!headId) continue;
    const version = history.versions.get(headId);
    if (!version || JSON.stringify(version.order) !== JSON.stringify(order)) {
      throw new Error('sync_parent_order_head_unproven');
    }
  }
  const memberIds = [...new Set([...left, ...right])];
  await ensureSyncSpecialRootNodes(port, memberIds.map((nodeId) => ({
    nodeId, referencedAt: new Date().toISOString()
  })));
  const membership = await loadParentOrderMembers(port, parentId, memberIds, incomingAlias);
  const resolution = await readParentOrderResolutionSnapshots(port, history, headIds);
  const result = resolvePlannedParentOrderHeads({ ...resolution, ...membership });
  const childIdsJson = JSON.stringify(result.order);
  return { parentId, childIdsJson, version: result.version,
    contentHash: mergedOrderHash(parentId, childIdsJson),
    baseContentHash: local?.sync_dirty === 1
      ? local.base_content_hash ?? local.content_hash : local?.content_hash ?? incoming.content_hash };
}

/** Persist the merged order after ordinary pack state rows, in the same apply transaction. */
export async function persistSyncIdentityParentOrderMerges(port: DbPort,
  staged: StagedOrderMerge[], hostName: string) {
  for (const merge of staged) await persistOne(port, merge, hostName);
}

async function persistOne(port: DbPort, staged: StagedOrderMerge, hostName: string) {
  const now = new Date().toISOString();
  if (staged.version.kind === 'merge') await insertParentOrderVersion(port, staged.parentId,
    staged.version, PARENT_ORDER_BASELINE_TIME);
  await advanceParentOrderHead(port, staged.parentId, staged.version.versionId);
  await port.run(`INSERT INTO parent_child_order (parent_id, child_ids_json, updated_at)
    VALUES (?, ?, ?) ON CONFLICT(parent_id) DO UPDATE SET
    child_ids_json = excluded.child_ids_json, updated_at = excluded.updated_at`,
  [staged.parentId, staged.childIdsJson, now]);
  await port.run(`UPDATE sync_object_state SET state_seq = ${NEXT_SYNC_STATE_SEQ_SQL},
    current_version_id = ?, content_hash = ?, base_content_hash = ?, last_modified_by_host_name = ?,
    updated_at = ?, deleted_at = NULL, sync_dirty = 1
    WHERE object_type = 'parent_child_order' AND object_id = ?`,
  [staged.version.versionId, staged.contentHash, staged.baseContentHash, hostName, now, staged.parentId]);
}
