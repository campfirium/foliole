import { expect, it } from 'vitest';

import { buildReviewFlowWindow } from '../store/workspaceReviewFlowWindow';

import { canonicalGuidePath, DEMO_TOPICS, getDemoTopicNodeId } from './demoContent';
import { createDemoWorkspaceSnapshot } from './demoWorkspaceSnapshot';

it('builds the first-run Demo flow without learned or future-day state', () => {
  const now = '2026-06-17T00:00:00.000Z';
  const topic = DEMO_TOPICS[0];
  if (!topic) throw new Error('Demo first-run test requires a topic.');

  const snapshot = createDemoWorkspaceSnapshot(canonicalGuidePath(topic.slug), new Date(now));
  const topicNodeId = getDemoTopicNodeId(topic);
  const flowWindow = buildReviewFlowWindow({
    ...snapshot,
    reviewSessionMode: 'recommended'
  }, now, snapshot.reviewSession.queueNodeIds);
  const flowNodeIds = [
    ...flowWindow.queueNodeIds,
    ...flowWindow.readyNodeIds,
    ...flowWindow.dayBuckets.flatMap((bucket) => bucket.nodeIds)
  ];

  expect(flowNodeIds).toContain(topicNodeId);
  expect(flowWindow.dayBuckets.filter((bucket) => bucket.dayOffset > 0)).toEqual([]);
  expect(Object.values(flowWindow.dayOffsetByNodeId).every((dayOffset) => dayOffset === 0)).toBe(true);
  expect(snapshot.nodesById[topicNodeId]?.reading).toMatchObject({
    repetitionCount: 0,
    state: 'active'
  });
});
