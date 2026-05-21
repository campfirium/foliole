import { expect, it } from 'vitest';

import { buildLiveReviewQueueOutput } from './workspaceReviewLiveQueue';
import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import {
  createQaNode,
  createReadingNode,
  createSchedulerGradeMock,
  createSetStateHarness,
  createWorkspaceFixture,
  previewStub
} from './workspaceStoreReviewActions.test-support';

it('splits review-first due readings into extension without expanding the task', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const state = {
    ...createWorkspaceFixture([
      createQaNode('qa-due', '2026-03-01T00:00:00.000Z'),
      createReadingNode('reading-due', '2026-03-01T00:00:00.000Z')
    ]),
    reviewSessionMode: 'review-first' as const
  };

  const output = buildLiveReviewQueueOutput(state, now);

  expect(output.taskNodeIds).toEqual(['qa-due']);
  expect(output.extensionNodeIds).toEqual(['reading-due']);
  expect(output.visibleNodeIds).toEqual(['qa-due', 'reading-due']);
});

it('keeps an actionable current pin at the front without trusting the old session queue', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const state = {
    ...createWorkspaceFixture([
      createQaNode('qa-first', '2026-03-01T00:00:00.000Z'),
      createQaNode('qa-current', '2026-03-02T00:00:00.000Z')
    ]),
    reviewSession: {
      currentNodeId: 'qa-current',
      isAnswerRevealed: false,
      queueNodeIds: ['qa-stale'],
      totalNodeCount: 2
    }
  };

  const output = buildLiveReviewQueueOutput(state, now, { pinnedNodeId: state.reviewSession.currentNodeId });

  expect(output.currentNodeId).toBe('qa-current');
  expect(output.taskNodeIds).toEqual(['qa-current', 'qa-first']);
  expect(output.visibleNodeIds).toEqual(['qa-current', 'qa-first']);
});

it('resumes due cards from the live queue even when they are missing from the persisted session queue', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const harness = createSetStateHarness({
    ...createWorkspaceFixture([
      createQaNode('qa-stale-session', '2026-03-12T12:00:00.000Z'),
      createQaNode('qa-live', '2026-03-01T00:00:00.000Z')
    ]),
    reviewSession: {
      currentNodeId: 'qa-stale-session',
      isAnswerRevealed: true,
      queueNodeIds: ['qa-stale-session'],
      totalNodeCount: 1
    }
  });
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
    grade: createSchedulerGradeMock(),
    preview: previewStub
  });

  expect(actions.resumeReviewSession(now)).toBe(true);

  expect(harness.getState().activeNodeId).toBe('qa-live');
  expect(harness.getState().reviewSession).toMatchObject({
    currentNodeId: 'qa-live',
    isAnswerRevealed: false,
    queueNodeIds: ['qa-live'],
    totalNodeCount: 1
  });
});

it('resumes a restored study session whose persisted queue is empty', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const harness = createSetStateHarness({
    ...createWorkspaceFixture([createQaNode('qa-live', '2026-03-01T00:00:00.000Z')]),
    activeNodeId: 'qa-live',
    reviewSession: {
      currentNodeId: null,
      isAnswerRevealed: false,
      queueNodeIds: [],
      sessionStartedAt: '2026-03-10T11:55:00.000Z',
      totalNodeCount: 0
    }
  });
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
    grade: createSchedulerGradeMock(),
    preview: previewStub
  });

  expect(actions.resumeReviewSession(now)).toBe(true);

  expect(harness.getState().activeNodeId).toBe('qa-live');
  expect(harness.getState().reviewSession).toMatchObject({
    currentNodeId: 'qa-live',
    isAnswerRevealed: false,
    queueNodeIds: ['qa-live'],
    sessionStartedAt: '2026-03-10T11:55:00.000Z',
    totalNodeCount: 1
  });
});

it('resumes a restored current review item even when the persisted queue omitted it', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const harness = createSetStateHarness({
    ...createWorkspaceFixture([createQaNode('qa-current', '2026-03-01T00:00:00.000Z')]),
    activeNodeId: 'qa-current',
    reviewSession: {
      currentNodeId: 'qa-current',
      isAnswerRevealed: false,
      queueNodeIds: [],
      sessionStartedAt: '2026-03-10T11:55:00.000Z',
      totalNodeCount: 1
    }
  });
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
    grade: createSchedulerGradeMock(),
    preview: previewStub
  });

  expect(actions.resumeReviewSession(now)).toBe(true);

  expect(harness.getState().reviewSession).toMatchObject({
    currentNodeId: 'qa-current',
    isAnswerRevealed: false,
    queueNodeIds: ['qa-current'],
    sessionStartedAt: '2026-03-10T11:55:00.000Z',
    totalNodeCount: 1
  });
});

it('advances from the live queue after grading instead of the persisted session queue', async () => {
  const due = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createQaNode('qa-1', due), createQaNode('qa-live', due)])
  );
  const grade = createSchedulerGradeMock();
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, { grade, preview: previewStub });

  harness.setState({
    activeNodeId: 'qa-1',
    reviewSession: {
      currentNodeId: 'qa-1',
      isAnswerRevealed: true,
      queueNodeIds: ['qa-1'],
      totalNodeCount: 1
    }
  });

  await expect(actions.gradeReviewCard(3, due)).resolves.toBe(true);

  expect(harness.getState().activeNodeId).toBe('qa-live');
  expect(harness.getState().reviewSession.currentNodeId).toBe('qa-live');
  expect(harness.getState().reviewSession.queueNodeIds).toEqual(['qa-live']);
});

it('does not double count a low-graded card that remains in the task window', async () => {
  const due = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(createWorkspaceFixture([createQaNode('qa-repeat', due)]));
  const grade = async () => ({
    card: {
      due,
      difficulty: 4,
      elapsed_days: 0,
      lapses: 1,
      last_review: due,
      reps: 1,
      scheduled_days: 0,
      stability: 0.1,
      state: 1 as const
    },
    reviewed_at: due
  });
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, { grade, preview: previewStub });

  actions.startReviewSession(due);
  actions.revealReviewAnswer();
  await expect(actions.gradeReviewCard(1, due)).resolves.toBe(true);

  expect(harness.getState().reviewSession.currentNodeId).toBe('qa-repeat');
  expect(harness.getState().reviewSession.reviewedItemCount).toBe(0);
});
