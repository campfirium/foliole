import { expect, it } from 'vitest';

import { prepareFlowSession } from '../../lib/core/flow/dailyFlowPlanning';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import { canonicalGuidePath, DEMO_TOPICS, getDemoTopicNodeId } from './demoContent';
import { createDemoWorkspaceSnapshot } from './demoWorkspaceSnapshot';

it('builds the first-run Demo flow without learned or future-day state', () => {
  const now = '2026-06-17T00:00:00.000Z';
  const topic = DEMO_TOPICS[0];
  if (!topic) throw new Error('Demo first-run test requires a topic.');

  const snapshot = createDemoWorkspaceSnapshot(canonicalGuidePath(topic.slug), new Date(now));
  const topicNodeId = getDemoTopicNodeId(topic);
  const session = prepareFlowSession(snapshot, { now, mode: 'recommended', prepareOnly: true }, getCurrentReviewSchedulerSettings());
  expect(session.queueNodeIds).toContain(topicNodeId);
  expect(session.sessionStartedAt).toBeNull();
  expect(session.readTopicCount).toBe(0);
  expect(snapshot.nodesById[topicNodeId]?.reading).toMatchObject({
    repetitionCount: 0,
    state: 'active'
  });
});
