import { expect, it, vi } from 'vitest';

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
    syncNodeContentToRuntimeNow: vi.fn(async () => true)
  };
});

it('shows a completed checkpoint after the last review card before reading topics', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(
    {
      ...createWorkspaceFixture([createQaNode('qa-1', now), createReadingNode('reading-1', now)]),
      reviewSessionMode: 'review-first'
    }
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
    grade: createSchedulerGradeMock(),
    preview: previewStub
  });

  actions.startReviewSession(now);
  actions.revealReviewAnswer();
  const graded = await actions.gradeReviewCard(3, '2026-03-03T00:04:00.000Z');

  expect(graded).toBe(true);
  expect(harness.getState().reviewSession).toMatchObject({
    completedAt: '2026-03-03T00:04:00.000Z',
    continueNodeId: 'reading-1',
    currentNodeId: null,
    isAnswerRevealed: false,
    queueNodeIds: [],
    readTopicCount: 0,
    reviewedItemCount: 1,
    sessionStartedAt: now,
    totalNodeCount: 1
  });
  expect(harness.getState().activeNodeId).toBe('reading-1');
});

it('shows a queue-clear checkpoint in recommended mode after the last review item before reading topics', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createQaNode('qa-1', now), createReadingNode('reading-1', now)])
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
    grade: createSchedulerGradeMock(),
    preview: previewStub
  });

  actions.startReviewSession(now);
  actions.revealReviewAnswer();
  const graded = await actions.gradeReviewCard(3, '2026-03-03T00:04:00.000Z');

  expect(graded).toBe(true);
  expect(harness.getState().reviewSession).toMatchObject({
    completedAt: '2026-03-03T00:04:00.000Z',
    continueNodeId: 'reading-1',
    currentNodeId: null,
    queueNodeIds: [],
    reviewedItemCount: 1,
    totalNodeCount: 1
  });
  expect(harness.getState().activeNodeId).toBe('reading-1');
});

it('continues the recommended Flow from queue clear into reading topics', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createQaNode('qa-1', now), createReadingNode('reading-1', now)])
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
    grade: createSchedulerGradeMock(),
    preview: previewStub
  });

  actions.startReviewSession(now);
  actions.revealReviewAnswer();
  await actions.gradeReviewCard(3, '2026-03-03T00:04:00.000Z');

  const continued = actions.continueReviewSessionReading('2026-03-03T00:05:00.000Z');

  expect(continued).toBe(true);
  expect(harness.getState().reviewSessionMode).toBe('recommended');
  expect(harness.getState().reviewSession).toMatchObject({
    completedAt: null,
    continueNodeId: 'reading-1',
    currentNodeId: 'reading-1',
    queueNodeIds: ['reading-1'],
    reviewedItemCount: 1,
    totalNodeCount: 2
  });
  expect(harness.getState().activeNodeId).toBe('reading-1');
});

it('does not start review-first by falling back to due reading topics', () => {
  const now = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness({
    ...createWorkspaceFixture([createReadingNode('reading-1', now)]),
    reviewSessionMode: 'review-first'
  });
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
    grade: createSchedulerGradeMock(),
    preview: previewStub
  });

  expect(actions.startReviewSession(now)).toBe(false);
  expect(harness.getState().reviewSession).toMatchObject({
    currentNodeId: null,
    queueNodeIds: [],
    totalNodeCount: 0
  });
});

it('keeps a completed session checkpoint after reading the last topic', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(createWorkspaceFixture([createReadingNode('reading-1', now)]));
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
    grade: createSchedulerGradeMock(),
    preview: previewStub
  });

  actions.startReviewSession(now);
  const completed = await actions.readReviewTopic('2026-03-03T00:05:00.000Z');

  expect(completed).toBe(true);
  expect(harness.getState().reviewSession).toMatchObject({
    completedAt: '2026-03-03T00:05:00.000Z',
    currentNodeId: null,
    isAnswerRevealed: false,
    queueNodeIds: [],
    readTopicCount: 1,
    reviewedItemCount: 0,
    sessionStartedAt: now,
    totalNodeCount: 1
  });
});
