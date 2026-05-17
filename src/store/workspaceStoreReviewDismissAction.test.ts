import { beforeEach, expect, it, vi } from 'vitest';

import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
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
    syncNodeContentToRuntime: vi.fn()
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

it('creates a persisted reading profile when dismissing a first-time reading item', () => {
  const now = '2026-03-03T00:00:00.000Z';
  const firstTimeReadingNode = {
    ...createReadingNode('reading-1', now),
    reading: null
  };
  const harness = createSetStateHarness(
    createWorkspaceFixture([firstTimeReadingNode, createReadingNode('reading-2', now)])
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
    grade: createSchedulerGradeMock(),
    preview: previewStub
  });

  actions.startReviewSession(now);

  expect(actions.dismissReviewItem(now)).toBe(true);
  expect(harness.getState().nodesById['reading-1']?.reading).toMatchObject({
    lastHandledAt: now,
    nextAt: now,
    readingPosition: 0,
    state: 'dismissed'
  });
  expect(syncNodeContentToRuntime).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'reading-1',
      reading: expect.objectContaining({ state: 'dismissed' })
    })
  );
});
