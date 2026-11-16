import { canonicalParentOrderSources, currentParentOrderHash, parseParentOrderSources,
  projectCurrentParentOrder, type CurrentOrderMember } from '../sync/currentParentOrder.js';

import { PARENT_ORDER_MEMBERS_SQL,
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

export function readCurrentParentOrder(driver: DatabaseDriver, parentId: string, members: readonly CurrentOrderMember[]) {
  return projectCurrentParentOrder(readCurrentParentOrderSources(driver, parentId), members);
}

export function saveLocalCurrentParentOrder(driver: DatabaseDriver, input: {
  parentId: string; childIds: string[]; previousChildIds?: readonly string[]; now: string; hostName: string;
}) {
  return driver.transaction(() => {
    const { parentId, childIds, previousChildIds, now, hostName } = input;
    const sources = readCurrentParentOrderSources(driver, parentId);
    const previous = previousChildIds ?? (sources.length ? projectCurrentParentOrder(sources,
      driver.queryAll<CurrentOrderMember & DatabaseRow>(PARENT_ORDER_MEMBERS_SQL, [parentId, parentId])) : []);
    if (JSON.stringify(previous) === JSON.stringify(childIds)) return false;
    const authorId = requireParentOrderWriter(driver);
    const counter = Math.max(0, ...sources.map((source) => source.counter)) + 1;
    const [next] = parseParentOrderSources([{ authorId, counter, childIds }]);
    if (!next) throw new Error('parent_order_local_source_missing');
    const updated = canonicalParentOrderSources([...sources.filter((source) => source.authorId !== authorId), next]);
    driver.execute(PARENT_ORDER_SOURCE_WRITE_SQL, [parentId, authorId, counter, JSON.stringify(childIds)]);
    upsertSyncObjectState(driver, { objectType: 'parent_child_order', objectId: parentId,
      contentHash: currentParentOrderHash(parentId, updated), currentVersionId: null,
      lastModifiedByHostName: hostName, updatedAt: now, syncDirty: true });
    return true;
  });
}
