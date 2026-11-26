import { hasNodeContent } from '../nodes/nodeContentFlags.js';
import { hasDeletedAncestor, hasShelvedAncestor } from '../review/queue/reviewQueuePlannerHelpers.js';
import { isReadingReviewItemNode } from '../review/reviewItemKind.js';

import type { DailyFlowLearningSnapshot } from './dailyFlowContract.js';
import type { DailyFlowStore } from './dailyFlowStore.js';

export function isUnreadDiveTopic(id: string, snapshot: DailyFlowLearningSnapshot) {
  const node = snapshot.nodesById[id];
  return Boolean(node?.kind === 'topic' && isReadingReviewItemNode(node) && hasNodeContent(node) &&
    !snapshot.trashedNodeIds.includes(id) && !hasDeletedAncestor(node, snapshot.nodesById) &&
    !hasShelvedAncestor(node, snapshot.nodesById) &&
    (!node.reading || (node.reading.state === 'active' && node.reading.repetitionCount === 0)));
}

const SEARCH_BATCH_SIZE = 32;

// Keep the positions of this round stable as sources are added or removed.
function diveRound(members: string[], previousOrder: readonly string[], position: number) {
  const order = [...new Set([...previousOrder, ...members])];
  const memberSet = new Set(members);
  return { order, remaining: order.slice(position).filter(id => memberSet.has(id)) };
}

export async function readDiveUnreadRound(store: DailyFlowStore, members: string[],
  previousOrder: readonly string[], position: number) {
  const { order, remaining } = diveRound(members, previousOrder, position);
  const snapshot = await store.scopedLearningSnapshot(remaining);
  return { order, unread: remaining.filter(id => isUnreadDiveTopic(id, snapshot)) };
}

/** Advancing needs only the first unread Topic, so stop loading once a batch holds it. */
export async function findNextDiveUnread(store: DailyFlowStore, members: string[],
  previousOrder: readonly string[], position: number) {
  const { order, remaining } = diveRound(members, previousOrder, position);
  for (let start = 0; start < remaining.length; start += SEARCH_BATCH_SIZE) {
    const ids = remaining.slice(start, start + SEARCH_BATCH_SIZE);
    const snapshot = await store.scopedLearningSnapshot(ids);
    const current = ids.find(id => isUnreadDiveTopic(id, snapshot));
    if (current) return { order, current };
  }
  return { order, current: null };
}
