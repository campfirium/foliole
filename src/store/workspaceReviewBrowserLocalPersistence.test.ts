import { beforeEach, expect, it, vi } from 'vitest';

import { saveNodeReadingStateToRuntime } from '../shared/platform/runtime/nodeReadingStateRuntimeRepository';

import { browserLocalWorkspaceReviewPersistence } from './workspaceReviewPersistence';
import { syncReviewGradeToRuntime } from './workspaceRuntimeSync';
import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import {
  createQaNode,
  createReadingNode,
  createSchedulerGradeMock,
  createSetStateHarness,
  createWorkspaceFixture,
  previewStub
} from './workspaceStoreReviewActions.test-support';

vi.mock('./workspaceRuntimeSync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./workspaceRuntimeSync')>();
  return {
    ...actual,
    syncNodeContentToRuntimeNow: vi.fn(async () => false),
    syncReviewGradeToRuntime: vi.fn(async () => {
      throw new Error('missing runtime');
    })
  };
});
vi.mock('../shared/platform/runtime/nodeReadingStateRuntimeRepository', () => ({
  saveNodeReadingStateToRuntime: vi.fn(async () => false)
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function createBrowserLocalActions(nodes: Parameters<typeof createWorkspaceFixture>[0]) {
  const harness = createSetStateHarness(createWorkspaceFixture(nodes));
  const actions = createWorkspaceReviewActions(
    harness.setState,
    harness.getState,
    { grade: createSchedulerGradeMock(), preview: previewStub },
    browserLocalWorkspaceReviewPersistence
  );
  return { actions, harness };
}

it('updates reading review actions without runtime persistence', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const { actions, harness } = createBrowserLocalActions([
    createReadingNode('reading-1', '2026-03-02T00:00:00.000Z'),
    createReadingNode('reading-2', now)
  ]);

  actions.startReviewSession(now);
  const currentNodeId = harness.getState().reviewSession.currentNodeId!;
  await expect(actions.postponeReviewTopic(now)).resolves.toBe(true);

  expect(saveNodeReadingStateToRuntime).not.toHaveBeenCalled();
  expect(harness.getState().nodesById[currentNodeId]?.reading).toMatchObject({
    lastHandledAt: now,
    state: 'active'
  });
  expect(harness.getState().reviewSession.currentNodeId).not.toBe(currentNodeId);
});

it('updates soon and dismiss review state without runtime persistence', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const { actions, harness } = createBrowserLocalActions([
    createReadingNode('reading-1', '2026-03-02T00:00:00.000Z'),
    createReadingNode('reading-2', '2026-03-02T01:00:00.000Z')
  ]);

  actions.startReviewSession(now);
  const soonNodeId = harness.getState().reviewSession.currentNodeId!;
  await expect(actions.revisitReviewTopicSoon(now)).resolves.toBe(true);
  expect(harness.getState().reviewSession.soonNodeIds).toEqual([soonNodeId]);
  const dismissedNodeId = harness.getState().reviewSession.currentNodeId!;

  await expect(actions.dismissReviewTopic(now)).resolves.toBe(true);
  expect(saveNodeReadingStateToRuntime).not.toHaveBeenCalled();
  expect(harness.getState().nodesById[dismissedNodeId]?.reading?.state).toBe('dismissed');
});

it('updates topic delay and fsrs grade without runtime persistence', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const { actions, harness } = createBrowserLocalActions([
    createReadingNode('reading-1', '2026-03-02T00:00:00.000Z'),
    createQaNode('qa-1', now)
  ]);

  await expect(actions.setReviewTopicDelay('reading-1', 2, now)).resolves.toBe(true);
  expect(harness.getState().nodesById['reading-1']?.reading?.nextAt).toBe('2026-03-17T00:00:00.000Z');

  actions.startReviewSession(now);
  actions.revealReviewAnswer();
  await expect(actions.gradeReviewCard(3, now)).resolves.toBe(true);

  expect(saveNodeReadingStateToRuntime).not.toHaveBeenCalled();
  expect(syncReviewGradeToRuntime).not.toHaveBeenCalled();
  expect(harness.getState().nodesById['qa-1']?.review).toMatchObject({
    lastReviewAt: now,
    reps: 1
  });
});
