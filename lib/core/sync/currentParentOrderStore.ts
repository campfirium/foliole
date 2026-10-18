import { z } from 'zod';

import { PARENT_ORDER_MATERIALIZE_SQL, PARENT_ORDER_MEMBERS_SQL,
  PARENT_ORDER_SOURCES_SQL, PARENT_ORDER_SOURCE_WRITE_SQL } from '../database/currentParentOrderSchema.js';
import { NEXT_SYNC_STATE_SEQ_SQL } from '../database/syncStateSequenceSchemaStatements.js';

import { canonicalParentOrderSources, currentParentOrderHash, joinParentOrderSources, parseParentOrderSources,
  projectCurrentParentOrder, type CurrentOrderMember } from './currentParentOrder.js';
import type { DbPort, DbRow } from './dbPort.js';
import { requireParentOrderWriterWithDbPort } from './parentOrderWriter.js';
import type { SyncObjectRecord } from './syncObjectRecord.js';


export async function loadCurrentParentOrderSources(port: DbPort, parentId: string) {
  const rows = await port.query<{ authorId: string; counter: number; child_ids_json: string }>(
    PARENT_ORDER_SOURCES_SQL, [parentId]);
  return parseParentOrderSources(rows.map(({ authorId, counter, child_ids_json }) =>
    ({ authorId, counter, childIds: JSON.parse(child_ids_json) })));
}

export async function projectCurrentParentOrderWithDbPort(port: DbPort, parentId: string, now: string, onChanged?: () => void) {
  const sources = await loadCurrentParentOrderSources(port, parentId);
  const members = await port.query<CurrentOrderMember & DbRow>(PARENT_ORDER_MEMBERS_SQL, [parentId, parentId]);
  const order = projectCurrentParentOrder(sources, members);
  const written = await port.run(PARENT_ORDER_MATERIALIZE_SQL, [parentId, JSON.stringify(order), now]);
  if (written.changes > 0) onChanged?.();
  await port.run('DELETE FROM parent_order_projection_pending WHERE parent_id = ?', [parentId]);
  return order;
}

export async function flushCurrentParentOrderProjectionsWithDbPort(port: DbPort) {
  let changed = false;
  const now = new Date().toISOString();
  for (const { parent_id } of await port.query<{ parent_id: string }>(
    'SELECT parent_id FROM parent_order_projection_pending ORDER BY parent_id')) {
    await projectCurrentParentOrderWithDbPort(port, parent_id, now, () => { changed = true; });
  }
  return changed;
}

const payloadSchema = z.object({ parent_id: z.string().min(1), sources_json: z.string() }).strict();

export function applyCurrentParentOrderRecord(port: DbPort, record: SyncObjectRecord) {
  return port.transaction(async (tx) => {
    if (record.deleted_at || !record.payload_json) throw new Error('invalid_parent_child_order');
    const payload = payloadSchema.parse(JSON.parse(record.payload_json));
    const incoming = parseParentOrderSources(JSON.parse(payload.sources_json));
    if (payload.parent_id !== record.object_id ||
        currentParentOrderHash(payload.parent_id, incoming) !== record.content_hash) {
      throw new Error('sync_parent_order_state_mismatch');
    }
    const local = await loadCurrentParentOrderSources(tx, payload.parent_id);
    const sources = joinParentOrderSources(local, incoming);
    const changed = currentParentOrderHash(payload.parent_id, local) !== currentParentOrderHash(payload.parent_id, sources);
    for (const source of sources) await tx.run(PARENT_ORDER_SOURCE_WRITE_SQL,
      [payload.parent_id, source.authorId, source.counter, JSON.stringify(source.childIds)]);
    const now = new Date().toISOString();
    await projectCurrentParentOrderWithDbPort(tx, payload.parent_id, now);
    if (changed) await storeParentOrderState(tx, payload.parent_id,
      currentParentOrderHash(payload.parent_id, sources), now, 'sync-remote');
    return changed;
  });
}

export function saveLocalCurrentParentOrderWithDbPort(port: DbPort, input: {
  parentId: string; childIds: string[]; now: string; hostName: string;
}) {
  return port.transaction(async (tx) => {
    const { parentId, childIds, now, hostName } = input;
    const [current] = await tx.query<{ child_ids_json: string }>(
      'SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?', [parentId]);
    if ((current?.child_ids_json ?? '[]') === JSON.stringify(childIds)) return false;
    const authorId = await requireParentOrderWriterWithDbPort(tx);
    const sources = await loadCurrentParentOrderSources(tx, parentId);
    const counter = Math.max(0, ...sources.map((source) => source.counter)) + 1;
    const [next] = parseParentOrderSources([{ authorId, counter, childIds }]);
    if (!next) throw new Error('parent_order_local_source_missing');
    const updated = canonicalParentOrderSources([...sources.filter((source) => source.authorId !== authorId), next]);
    await tx.run(PARENT_ORDER_SOURCE_WRITE_SQL, [parentId, authorId, counter, JSON.stringify(childIds)]);
    await projectCurrentParentOrderWithDbPort(tx, parentId, now);
    await storeParentOrderState(tx, parentId, currentParentOrderHash(parentId, updated), now, hostName);
    return true;
  });
}

function storeParentOrderState(port: DbPort, parentId: string, hash: string, now: string, hostName: string) {
  return port.run(`INSERT INTO sync_object_state
      (object_type, object_id, state_seq, current_version_id, content_hash,
        last_modified_by_host_name, updated_at, deleted_at, sync_dirty)
      VALUES ('parent_child_order', ?, ${NEXT_SYNC_STATE_SEQ_SQL}, NULL, ?, ?, ?, NULL, 1)
      ON CONFLICT(object_type, object_id) DO UPDATE SET state_seq = excluded.state_seq,
        current_version_id = NULL, content_hash = excluded.content_hash, updated_at = excluded.updated_at,
        last_modified_by_host_name = excluded.last_modified_by_host_name,
        deleted_at = NULL, sync_dirty = 1`, [parentId, hash, hostName, now]);
}
