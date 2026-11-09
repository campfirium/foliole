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

export async function readDiveUnreadRound(store: DailyFlowStore, members: string[],
  previousOrder: readonly string[], position: number) {
  // Keep the positions of this round stable as sources are added or removed.
  const order = [...new Set([...previousOrder, ...members])];
  const memberSet = new Set(members);
  const remaining = order.slice(position).filter(id => memberSet.has(id));
  const snapshot = await store.scopedLearningSnapshot(remaining);
  return { order, unread: remaining.filter(id => isUnreadDiveTopic(id, snapshot)) };
}
