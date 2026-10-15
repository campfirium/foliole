import { canonicalParentOrderSources, currentParentOrderHash, parseParentOrderSources,
  projectCurrentParentOrder, type CurrentOrderMember } from '../sync/currentParentOrder.js';

import { PARENT_ORDER_MATERIALIZE_SQL, PARENT_ORDER_MEMBERS_SQL,
  PARENT_ORDER_SOURCES_SQL, PARENT_ORDER_SOURCE_WRITE_SQL } from './currentParentOrderSchema.js';
import type { DatabaseDriver, DatabaseRow } from './driver.js';
import { requireParentOrderWriter } from './parentOrderWriter.js';
import { upsertSyncObjectState } from './syncState.js';

export function readCurrentParentOrderSources(driver: DatabaseDriver, parentId: string) {
  const rows = driver.queryAll<{ authorId: string; counter: number; child_ids_json: string }>(
    PARENT_ORDER_SOURCES_SQL, [parentId]);
  return parseParentOrderSources(rows.map(({ authorId, counter, child_ids_json }) =>
    ({ authorId, counter, childIds: JSON.parse(child_ids_json) })));
}

export function projectStoredParentOrder(driver: DatabaseDriver, parentId: string, now: string) {
  const sources = readCurrentParentOrderSources(driver, parentId);
  const members = driver.queryAll<CurrentOrderMember & DatabaseRow>(PARENT_ORDER_MEMBERS_SQL, [parentId, parentId]);
  const order = projectCurrentParentOrder(sources, members);
  driver.execute(PARENT_ORDER_MATERIALIZE_SQL, [parentId, JSON.stringify(order), now]);
  driver.execute('DELETE FROM parent_order_projection_pending WHERE parent_id = ?', [parentId]);
  return order;
}

export function flushCurrentParentOrderProjections(driver: DatabaseDriver) {
  const now = new Date().toISOString();
  for (const { parent_id } of driver.queryAll<{ parent_id: string }>(
    'SELECT parent_id FROM parent_order_projection_pending ORDER BY parent_id')) {
    projectStoredParentOrder(driver, parent_id, now);
  }
}

export function saveLocalCurrentParentOrder(driver: DatabaseDriver, input: {
  parentId: string; childIds: string[]; now: string; hostName: string;
}) {
  return driver.transaction(() => {
    const { parentId, childIds, now, hostName } = input;
    const current = driver.queryOne<{ child_ids_json: string }>(
      'SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?', [parentId]);
    if ((current?.child_ids_json ?? '[]') === JSON.stringify(childIds)) return false;
    const authorId = requireParentOrderWriter(driver);
    const sources = readCurrentParentOrderSources(driver, parentId);
    const counter = Math.max(0, ...sources.map((source) => source.counter)) + 1;
    const [next] = parseParentOrderSources([{ authorId, counter, childIds }]);
    if (!next) throw new Error('parent_order_local_source_missing');
    const updated = canonicalParentOrderSources([...sources.filter((source) => source.authorId !== authorId), next]);
    driver.execute(PARENT_ORDER_SOURCE_WRITE_SQL, [parentId, authorId, counter, JSON.stringify(childIds)]);
    projectStoredParentOrder(driver, parentId, now);
    upsertSyncObjectState(driver, { objectType: 'parent_child_order', objectId: parentId,
      contentHash: currentParentOrderHash(parentId, updated), currentVersionId: null,
      lastModifiedByHostName: hostName, updatedAt: now, syncDirty: true });
    return true;
  });
}
