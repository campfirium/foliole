import { expect, it } from 'vitest';

import { buildReviewFlowWindow } from '../store/workspaceReviewFlowWindow';

import { canonicalDemoPath, DEMO_TOPICS } from './demoContent';
import { DEMO_GUIDES_WELCOME_NODE_ID_BY_LOCALE } from './demoGuides';
import { createDemoWorkspaceSnapshot } from './demoWorkspaceSnapshot';

it('builds the first-run Demo flow without learned or future-day state', () => {
  const now = '2026-06-17T00:00:00.000Z';
  const topic = DEMO_TOPICS[0];
  const item = topic?.reviewItems[0];
  if (!topic || !item) throw new Error('Demo first-run test requires a topic with a review item.');

  const snapshot = createDemoWorkspaceSnapshot(canonicalDemoPath(topic.slug), new Date(now));
  const welcomeNodeId = DEMO_GUIDES_WELCOME_NODE_ID_BY_LOCALE['en-US'];
  const itemNodeId = `demo-${item.id}`;
  const flowWindow = buildReviewFlowWindow({
    ...snapshot,
    reviewSessionMode: 'recommended'
  }, now, snapshot.reviewSession.queueNodeIds);
  const flowNodeIds = [
    ...flowWindow.queueNodeIds,
    ...flowWindow.readyNodeIds,
    ...flowWindow.dayBuckets.flatMap((bucket) => bucket.nodeIds)
  ];

  expect(flowNodeIds).toContain(welcomeNodeId);
  expect(flowNodeIds).toContain(itemNodeId);
  expect(flowWindow.dayBuckets.filter((bucket) => bucket.dayOffset > 0)).toEqual([]);
  expect(Object.values(flowWindow.dayOffsetByNodeId).every((dayOffset) => dayOffset === 0)).toBe(true);
  expect(snapshot.nodesById[welcomeNodeId]?.reading).toMatchObject({
    repetitionCount: 0,
    state: 'active'
  });
  expect(snapshot.nodesById[itemNodeId]?.review).toMatchObject({
    lapses: 0,
    lastReviewAt: null,
    reps: 0,
    state: 0
  });
});
