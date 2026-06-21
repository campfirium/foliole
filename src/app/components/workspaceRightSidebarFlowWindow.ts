import type { ReviewFlowWindow } from '../../store/workspaceReviewFlowWindow';

export function areStringArraysEqual(previous: readonly string[], next: readonly string[]) {
  return previous.length === next.length && previous.every((value, index) => value === next[index]);
}

export function areFlowDayBucketsEqual(previous: ReviewFlowWindow, next: ReviewFlowWindow) {
  return (
    previous.dayBuckets.length === next.dayBuckets.length &&
    previous.dayBuckets.every((bucket, index) => {
      const nextBucket = next.dayBuckets[index];
      return Boolean(nextBucket && bucket.dayOffset === nextBucket.dayOffset && areStringArraysEqual(bucket.nodeIds, nextBucket.nodeIds));
    })
  );
}

export function collectFlowWindowNodeIds(flowWindow: ReviewFlowWindow) {
  return [
    ...flowWindow.queueNodeIds,
    ...flowWindow.readyNodeIds,
    ...flowWindow.upcomingNodeIds,
    ...flowWindow.dayBuckets.flatMap((bucket) => bucket.nodeIds)
  ];
}
