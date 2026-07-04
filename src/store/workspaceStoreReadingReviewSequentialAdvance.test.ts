import { beforeEach, expect, it, vi } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';

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

beforeEach(() => {
  vi.clearAllMocks();
});

function createSequentialFixture() {
  const folder: Node = {
    id: 'source-folder',
    parentNodeId: null,
    kind: 'folder',
    title: 'Source',
    content: '',
    reveal: null,
    review: null,
    sequentialReadingEnabled: true,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z'
  };
  const first = { ...createReadingNode('reading-1', '2026-03-02T00:00:00.000Z'), parentNodeId: 'source-folder' };
  const second = {
    ...createReadingNode('reading-2', '2026-03-02T00:00:00.000Z'),
    parentNodeId: 'source-folder',
    reading: { ...createReadingNode('reading-2', '2026-03-02T00:00:00.000Z').reading!, state: 'locked' as const }
  };
  return createWorkspaceFixture([first, second, folder]);
}

it('keeps the next sequential topic locked for normal read actions', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(createSequentialFixture());
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
    grade: createSchedulerGradeMock(),
    preview: previewStub
  });

  actions.startReviewSession(now);
  await expect(actions.readReviewTopic(now)).resolves.toBe(true);

  expect(harness.getState().nodesById['reading-2']?.reading?.state).toBe('locked');
});

it('releases the next sequential topic when read is submitted as advance-ready', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(createSequentialFixture());
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
    grade: createSchedulerGradeMock(),
    preview: previewStub
  });

  actions.startReviewSession(now);
  await expect(actions.readReviewTopic(now, { releaseSequentialReading: true })).resolves.toBe(true);

  expect(harness.getState().nodesById['reading-2']?.reading?.state).toBe('active');
  expect(syncNodeContentToRuntimeNow).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'reading-2',
      reading: expect.objectContaining({ state: 'active' })
    })
  );
});
