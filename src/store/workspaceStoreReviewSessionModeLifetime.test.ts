import { beforeEach, expect, it } from 'vitest';

import {
  DEFAULT_REVIEW_SCHEDULER_SETTINGS,
  hydrateCurrentReviewSchedulerSettings
} from '../features/settings/model/reviewSchedulerSettings';

import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import {
  createQaNode,
  createReadingNode,
  createSetStateHarness,
  createWorkspaceFixture,
  previewStub
} from './workspaceStoreReviewActions.test-support';

beforeEach(() => {
  hydrateCurrentReviewSchedulerSettings(DEFAULT_REVIEW_SCHEDULER_SETTINGS);
});

function createActions(nodes: Parameters<typeof createWorkspaceFixture>[0]) {
  const harness = createSetStateHarness(createWorkspaceFixture(nodes));
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
    grade: async () => {
      throw new Error('grade should not be called');
    },
    preview: previewStub
  });
  return { actions, harness };
}

it('keeps a selected mode through new sessions within the same learning day', () => {
  const now = new Date(2026, 2, 3, 10).toISOString();
  const { actions, harness } = createActions([
    createReadingNode('reading-1', now),
    createQaNode('qa-1', now)
  ]);

  actions.setReviewSessionMode('review-first', now);
  const started = actions.startReviewSession(now);

  expect(started).toBe(true);
  expect(harness.getState().reviewSessionMode).toBe('review-first');
  expect(harness.getState().reviewSessionModeExpiresAt).not.toBeNull();
  expect(harness.getState().reviewSession.queueNodeIds).toEqual(['qa-1']);
});

it('falls back to review and reading when the selected mode has no matching work', () => {
  const now = new Date(2026, 2, 3, 10).toISOString();
  const { actions, harness } = createActions([createReadingNode('reading-1', now)]);

  actions.setReviewSessionMode('review-first', now);
  const started = actions.startReviewSession(now);

  expect(started).toBe(true);
  expect(harness.getState().reviewSessionMode).toBe('recommended');
  expect(harness.getState().reviewSessionModeExpiresAt).toBeNull();
  expect(harness.getState().reviewSession.currentNodeId).toBe('reading-1');
});

it('uses review work after an empty reading-only preference falls back', () => {
  const now = new Date(2026, 2, 3, 10).toISOString();
  const { actions, harness } = createActions([createQaNode('qa-1', now)]);

  actions.setReviewSessionMode('reading-only', now);
  const started = actions.startReviewSession(now);

  expect(started).toBe(true);
  expect(harness.getState().reviewSessionMode).toBe('recommended');
  expect(harness.getState().reviewSession.currentNodeId).toBe('qa-1');
});

it('stays closed when neither the selected nor default mode has work', () => {
  const now = new Date(2026, 2, 3, 10).toISOString();
  const { actions, harness } = createActions([]);

  actions.setReviewSessionMode('review-first', now);
  const started = actions.startReviewSession(now);

  expect(started).toBe(false);
  expect(harness.getState().reviewSessionMode).toBe('recommended');
  expect(harness.getState().reviewSession.currentNodeId).toBeNull();
});

it('expires a selected mode at its learning day boundary', () => {
  const selectedAt = new Date(2026, 2, 3, 10).toISOString();
  const nextDay = new Date(2026, 2, 4, 10).toISOString();
  const { actions, harness } = createActions([createReadingNode('reading-1', nextDay)]);

  actions.setReviewSessionMode('review-first', selectedAt);
  const started = actions.startReviewSession(nextDay);

  expect(started).toBe(true);
  expect(harness.getState().reviewSessionMode).toBe('recommended');
  expect(harness.getState().reviewSessionModeExpiresAt).toBeNull();
  expect(harness.getState().reviewSession.currentNodeId).toBe('reading-1');
});
