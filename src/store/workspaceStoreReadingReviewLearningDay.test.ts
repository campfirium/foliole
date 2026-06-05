import { expect, it, vi } from 'vitest';

import { syncNodeContentToRuntimeNow } from './workspaceRuntimeSync';
import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import {
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
    syncNodeContentToRuntimeNow: vi.fn(async () => true)
  };
});

it('lets cross-day reading topics enter and complete after the learning day starts', async () => {
  const lastHandledAt = new Date(2026, 2, 9, 21).toISOString();
  const now = new Date(2026, 2, 10, 5).toISOString();
  const node = createReadingNode('reading-cross-day', new Date(2026, 2, 10, 21).toISOString());
  node.reading = node.reading ? { ...node.reading, lastHandledAt } : null;
  const harness = createSetStateHarness(createWorkspaceFixture([node]));
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
    grade: createSchedulerGradeMock(),
    preview: previewStub
  });

  expect(actions.startReviewSession(now)).toBe(true);
  expect(harness.getState().reviewSession.currentNodeId).toBe('reading-cross-day');
  await expect(actions.readReviewTopic(now)).resolves.toBe(true);

  expect(harness.getState().reviewSession.currentNodeId).toBeNull();
  expect(harness.getState().reviewSession.readTopicCount).toBe(1);
  expect(syncNodeContentToRuntimeNow).toHaveBeenCalledTimes(1);
});
