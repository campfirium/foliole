import { expect, it } from 'vitest';

import { buildStartReviewSessionQueue } from './workspaceReviewLiveQueue';
import { buildResumeReviewSessionQueue } from './workspaceReviewResumeQueue';
import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import {
  createReadingNode,
  createSchedulerGradeMock,
  createSetStateHarness,
  createWorkspaceFixture,
  previewStub
} from './workspaceStoreReviewActions.test-support';

function createFutureReadingState() {
  return {
    ...createWorkspaceFixture([createReadingNode('reading-future', '2026-03-12T00:00:00.000Z')]),
    activeNodeId: null,
    reviewSessionMode: 'recommended' as const
  };
}

function createMultiDayFutureReadingState() {
  return {
    ...createWorkspaceFixture([
      createReadingNode('reading-day-two', '2026-03-11T00:00:00.000Z'),
      createReadingNode('reading-day-three', '2026-03-12T00:00:00.000Z')
    ]),
    activeNodeId: null,
    reviewSessionMode: 'recommended' as const
  };
}

it('does not start scheduled future entries by default', () => {
  expect(buildStartReviewSessionQueue(createFutureReadingState(), '2026-03-10T12:00:00.000Z')).toEqual([]);
});

it('can start from scheduled future entries when the runtime allows Flow preview fallback', () => {
  const queue = buildStartReviewSessionQueue(createFutureReadingState(), '2026-03-10T12:00:00.000Z', {
    includeScheduledFallback: true
  });

  expect(queue).toEqual(['reading-future']);
});

it('can start from ready fallback entries after the preview day advances', () => {
  const queue = buildStartReviewSessionQueue(createFutureReadingState(), '2026-03-12T12:00:00.000Z', {
    includeScheduledFallback: true
  });

  expect(queue).toEqual(['reading-future']);
});

it('starts only the first visible future Demo day when multiple days are available', () => {
  const queue = buildStartReviewSessionQueue(createMultiDayFutureReadingState(), '2026-03-10T12:00:00.000Z', {
    includeScheduledFallback: true
  });

  expect(queue).toEqual(['reading-day-two']);
});

it('starts the persisted session from scheduled fallback when the installed runtime opts in', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const harness = createSetStateHarness(createFutureReadingState());
  const actions = createWorkspaceReviewActions(
    harness.setState,
    harness.getState,
    { grade: createSchedulerGradeMock(), preview: previewStub },
    undefined,
    { startReviewSession: { includeScheduledFallback: true } }
  );

  expect(actions.startReviewSession(now)).toBe(true);
  expect(harness.getState().activeNodeId).toBe('reading-future');
  expect(harness.getState().reviewSession).toMatchObject({
    currentNodeId: 'reading-future',
    queueNodeIds: ['reading-future'],
    totalNodeCount: 1
  });
});

it('resumes from a visible future Flow topic when Demo fallback is allowed', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const state = createMultiDayFutureReadingState();

  expect(buildResumeReviewSessionQueue(state, now)).toEqual([]);
  expect(buildResumeReviewSessionQueue(state, now, {
    includeScheduledFallback: true,
    preferredNodeId: 'reading-day-three'
  })).toEqual(['reading-day-three', 'reading-day-two']);
});
