import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../features/settings/model/reviewSchedulerSettings';

import { resolveSchedulingPanelData } from './WorkspaceRightSidebarSchedulingPanelModel';

function createTopicNode(overrides: Partial<Node> = {}): Node {
  return {
    content: '',
    createdAt: '2026-05-29T00:39:18.481Z',
    id: 'topic-1',
    kind: 'topic',
    parentNodeId: null,
    reading: null,
    reveal: null,
    review: null,
    title: 'Topic',
    updatedAt: '2026-05-29T00:39:18.481Z',
    ...overrides
  };
}

it('shows the computed reading growth factor for a new unscheduled topic', () => {
  const data = resolveSchedulingPanelData({
    activeNodeId: 'topic-1',
    nodesById: { 'topic-1': createTopicNode() },
    reviewSchedulerSettings: DEFAULT_REVIEW_SCHEDULER_SETTINGS
  });

  expect(data?.priority.value).toBe(5);
  expect(data?.readingGrowthFactor).toBe(1.3);
});

it('keeps absolute priority topics on the fastest reading growth factor', () => {
  const data = resolveSchedulingPanelData({
    activeNodeId: 'topic-1',
    nodesById: { 'topic-1': createTopicNode({ priority: 0 }) },
    reviewSchedulerSettings: DEFAULT_REVIEW_SCHEDULER_SETTINGS
  });

  expect(data?.priority.value).toBe(0);
  expect(data?.readingGrowthFactor).toBe(1.1);
});
