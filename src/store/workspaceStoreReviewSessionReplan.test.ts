import { expect, it, vi } from 'vitest';

import type { ReviewSchedulerAdapter } from '../features/review/model/reviewTypes';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS, saveReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import {
  createQaNode,
  createReadingNode,
  createSetStateHarness,
  createWorkspaceFixture
} from './workspaceStoreReviewActions.test-support';

vi.mock('./workspaceRuntimeSync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./workspaceRuntimeSync')>();
  return {
    ...actual,
    syncNodeContentToRuntimeNow: vi.fn(async () => true)
  };
});

const schedulerStub: ReviewSchedulerAdapter = {
  grade: async () => {
    throw new Error('grade should not be called');
  },
  preview: async () => {
    throw new Error('preview should not be called');
  }
};

it('replans the active session when the current mode is applied again after mix settings change', async () => {
  const now = '2026-03-10T12:00:00.000Z';
  await saveReviewSchedulerSettings({ pushQueue: { queueMixRatio: { reading: 1, fsrs: 1 } } });
  try {
    const fixture = {
      ...createWorkspaceFixture([
        createQaNode('qa-1', '2026-03-01T00:00:00.000Z'),
        createQaNode('qa-2', '2026-03-02T00:00:00.000Z'),
        createQaNode('qa-3', '2026-03-03T00:00:00.000Z'),
        createReadingNode('reading-1', now),
        createReadingNode('reading-2', now),
        createReadingNode('reading-outside', now)
      ]),
      reviewSession: {
        currentNodeId: 'qa-1',
        isAnswerRevealed: true,
        queueNodeIds: ['qa-1', 'qa-2', 'qa-3', 'reading-1', 'reading-2'],
        totalNodeCount: 6
      }
    };
    const harness = createSetStateHarness(fixture);
    const actions = createWorkspaceReviewActions(harness.setState, harness.getState, schedulerStub);

    actions.setReviewSessionMode('recommended', now);

    expect(harness.getState().reviewSessionMode).toBe('recommended');
    expect(harness.getState().reviewSession).toMatchObject({
      currentNodeId: 'qa-1',
      isAnswerRevealed: false,
      queueNodeIds: ['qa-1', 'reading-1', 'qa-2', 'reading-outside', 'qa-3'],
      totalNodeCount: 5
    });
  } finally {
    await saveReviewSchedulerSettings(DEFAULT_REVIEW_SCHEDULER_SETTINGS);
  }
});

it('keeps review advancement scoped to the active session queue', async () => {
  const now = '2026-03-10T12:00:00.000Z';
  const fixture = {
    ...createWorkspaceFixture([
      createReadingNode('reading-1', now),
      createReadingNode('reading-2', now),
      createReadingNode('reading-outside', now)
    ]),
    activeNodeId: 'reading-1',
    reviewSession: {
      currentNodeId: 'reading-1',
      isAnswerRevealed: false,
      queueNodeIds: ['reading-1', 'reading-2'],
      readTopicCount: 0,
      reviewedItemCount: 0,
      totalNodeCount: 2
    }
  };
  const harness = createSetStateHarness(fixture);
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, schedulerStub);

  await expect(actions.completeReviewItem(now)).resolves.toBe(true);

  expect(harness.getState().reviewSession).toMatchObject({
    currentNodeId: 'reading-outside',
    queueNodeIds: ['reading-outside', 'reading-2'],
    readTopicCount: 1,
    totalNodeCount: 2
  });
});
