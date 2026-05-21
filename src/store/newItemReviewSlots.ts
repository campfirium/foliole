import type { Node } from '../features/nodes/model/nodeTypes';

import { createDefaultReviewProfile } from './workspaceSeed';

type ReviewSlotNode = Pick<Node, 'kind' | 'review' | 'reveal' | 'hasReveal'> & {
  anchorLink?: Node['anchorLink'];
};

export const NEW_ITEM_REVIEW_SLOT_DAY_COUNT = 7;

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createFutureLocalDayStarts(now: Date) {
  return Array.from({ length: NEW_ITEM_REVIEW_SLOT_DAY_COUNT }, (_, index) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + index + 1)
  );
}

function initializeLoadByDay(dayStarts: Date[]) {
  return new Map(dayStarts.map((dayStart) => [toLocalDateKey(dayStart), 0]));
}

function countExistingReviewLoad(
  loadByDay: Map<string, number>,
  nodes: Iterable<ReviewSlotNode | undefined>
) {
  for (const node of nodes) {
    if (!node?.review || node.kind !== 'item') {
      continue;
    }
    const key = toLocalDateKey(new Date(node.review.due));
    if (loadByDay.has(key)) {
      loadByDay.set(key, (loadByDay.get(key) ?? 0) + 1);
    }
  }
}

function selectLowestLoadDay(dayStarts: Date[], loadByDay: Map<string, number>) {
  return dayStarts.reduce((selected, candidate) => {
    const selectedLoad = loadByDay.get(toLocalDateKey(selected)) ?? 0;
    const candidateLoad = loadByDay.get(toLocalDateKey(candidate)) ?? 0;
    return candidateLoad < selectedLoad ? candidate : selected;
  });
}

export function allocateNewItemReviewDueDates(args: {
  batchSize: number;
  nodes: Iterable<ReviewSlotNode | undefined>;
  now: string;
}) {
  const dayStarts = createFutureLocalDayStarts(new Date(args.now));
  const loadByDay = initializeLoadByDay(dayStarts);
  countExistingReviewLoad(loadByDay, args.nodes);

  const dueDates: string[] = [];
  for (let index = 0; index < args.batchSize; index += 1) {
    const selected = selectLowestLoadDay(dayStarts, loadByDay);
    const key = toLocalDateKey(selected);
    dueDates.push(selected.toISOString());
    loadByDay.set(key, (loadByDay.get(key) ?? 0) + 1);
  }
  return dueDates;
}

export function createNewItemReviewProfiles(args: {
  batchSize: number;
  nodesById: Record<string, ReviewSlotNode | undefined>;
  now: string;
}) {
  return allocateNewItemReviewDueDates({
    batchSize: args.batchSize,
    nodes: Object.values(args.nodesById),
    now: args.now
  }).map((due) => createDefaultReviewProfile(due));
}
