import { expect, it, vi } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';

import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import {
  createSchedulerGradeMock,
  createSetStateHarness,
  createWorkspaceFixture,
  previewStub
} from './workspaceStoreReviewActions.test-support';

vi.mock('./workspaceRuntimeSync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./workspaceRuntimeSync')>();
  return {
    ...actual,
    syncNodeContentToRuntimeNow: vi.fn(async () => true)
  };
});

function createUnscheduledReadingNode(id: string, createdAt: string): Node {
  return {
    id,
    parentNodeId: null,
    kind: 'topic',
    title: id,
    content: `${id}-content`,
    reveal: null,
    reading: null,
    review: null,
    createdAt,
    updatedAt: createdAt
  };
}

it('replays unscheduled reading topics after the current queue without creating reading records', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([
      createUnscheduledReadingNode('reading-1', '2026-03-02T00:00:00.000Z'),
      createUnscheduledReadingNode('reading-2', '2026-03-02T01:00:00.000Z'),
      createUnscheduledReadingNode('reading-3', '2026-03-02T02:00:00.000Z')
    ])
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
    grade: createSchedulerGradeMock(),
    preview: previewStub
  });
  actions.startReviewSession(now);
  const [firstNodeId, secondNodeId, thirdNodeId] = harness.getState().reviewSession.queueNodeIds as [string, string, string];

  await expect(actions.revisitReviewTopicSoon(now)).resolves.toBe(true);
  await expect(actions.revisitReviewTopicSoon(now)).resolves.toBe(true);

  expect(harness.getState().reviewSession.currentNodeId).toBe(thirdNodeId);
  expect(harness.getState().reviewSession.queueNodeIds).toEqual([thirdNodeId]);
  expect(harness.getState().reviewSession.soonNodeIds).toEqual([firstNodeId, secondNodeId]);
  expect(harness.getState().nodesById[firstNodeId]?.reading).toBeNull();
  expect(harness.getState().nodesById[secondNodeId]?.reading).toBeNull();

  await expect(actions.readReviewTopic(now)).resolves.toBe(true);
  expect(harness.getState().reviewSession.currentNodeId).toBe(firstNodeId);
  expect(harness.getState().reviewSession.soonNodeIds).toEqual([secondNodeId]);
  expect(harness.getState().nodesById[firstNodeId]?.reading).toBeNull();

  await expect(actions.readReviewTopic(now)).resolves.toBe(true);
  expect(harness.getState().reviewSession.currentNodeId).toBe(secondNodeId);
  expect(harness.getState().nodesById[secondNodeId]?.reading).toBeNull();
});
