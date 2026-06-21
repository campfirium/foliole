import { expect, it } from 'vitest';

import { buildReviewFlowWindow } from './workspaceReviewFlowWindow';
import { buildLiveReviewQueueOutput } from './workspaceReviewLiveQueue';
import {
  createQaNode,
  createReadingNode,
  createWorkspaceFixture
} from './workspaceStoreReviewActions.test-support';

it('builds a display-only flow window with future topics outside the live queue', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const queueNodeIds = ['qa-queue'];
  const state = {
    ...createWorkspaceFixture([
      createQaNode('qa-queue', '2026-03-01T00:00:00.000Z'),
      createQaNode('qa-ready', '2026-03-02T00:00:00.000Z'),
      createReadingNode('reading-ready', '2026-03-09T00:00:00.000Z'),
      createReadingNode('reading-upcoming', '2026-03-20T00:00:00.000Z')
    ]),
    reviewSession: {
      currentNodeId: 'qa-queue',
      isAnswerRevealed: false,
      queueNodeIds,
      totalNodeCount: 1
    }
  };

  const flowWindow = buildReviewFlowWindow(state, now, queueNodeIds);
  const liveQueue = buildLiveReviewQueueOutput(state, now);

  expect(flowWindow.queueNodeIds).toEqual(['qa-queue']);
  expect(flowWindow.readyNodeIds).toEqual(['qa-ready', 'reading-ready']);
  expect(flowWindow.upcomingNodeIds).toEqual(['reading-upcoming']);
  expect(flowWindow.dayBuckets).toEqual([{ dayOffset: 10, nodeIds: ['reading-upcoming'] }]);
  expect(liveQueue.taskNodeIds).not.toContain('reading-upcoming');
});

it('keeps ready and upcoming entries in separate flow windows', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const readyNodes = Array.from({ length: 22 }, (_, index) =>
    createReadingNode(`reading-ready-${index + 1}`, '2026-03-09T00:00:00.000Z')
  );
  const futureNodes = Array.from({ length: 25 }, (_, index) =>
    createReadingNode(`reading-upcoming-${index + 1}`, new Date(Date.parse(now) + (index + 1) * 86_400_000).toISOString())
  );
  const state = createWorkspaceFixture([...readyNodes, ...futureNodes]);

  const flowWindow = buildReviewFlowWindow(state, now, []);

  expect(flowWindow.readyNodeIds).toHaveLength(22);
  expect(flowWindow.upcomingNodeIds).toHaveLength(25);
  expect(flowWindow.dayBuckets[0]).toEqual({
    dayOffset: 1,
    nodeIds: ['reading-upcoming-1']
  });
  expect(flowWindow.dayBuckets[1]).toEqual({
    dayOffset: 2,
    nodeIds: ['reading-upcoming-2']
  });
  expect(flowWindow.upcomingNodeIds[0]).toBe('reading-upcoming-1');
  expect(flowWindow.upcomingNodeIds).not.toContain('reading-ready-1');
});
