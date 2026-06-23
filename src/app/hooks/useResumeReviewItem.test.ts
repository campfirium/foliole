import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { installDemoRuntimeController, type DemoRuntimeController } from '../../shared/platform/runtime/demoRuntime';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import type { ReviewSessionState } from '../../store/workspaceStore';

import { RESUME_REVIEW_UNAVAILABLE_NOTICE, resolveResumeReviewNodeId, useResumeReviewItem } from './useResumeReviewItem';

vi.mock('../../shared/ui/AppRuntimeNotice', () => ({
  showAppRuntimeNotice: vi.fn()
}));

function createNodeRecord(nodeIds: string[]) {
  return Object.fromEntries(nodeIds.map((nodeId) => [nodeId, { id: nodeId } as Node]));
}

function createSession(overrides: Partial<ReviewSessionState> = {}): ReviewSessionState {
  return {
    currentNodeId: 'review-1',
    isAnswerRevealed: false,
    queueNodeIds: ['review-1', 'review-2'],
    totalNodeCount: 2,
    ...overrides
  };
}

function installDemoRuntime(isDemo: boolean) {
  const state = {
    clearError: null,
    importError: null,
    importedTopicCount: 0,
    isDemo,
    manualAdvanceDays: 0,
    previewDay: 0,
    startedAt: null
  };
  installDemoRuntimeController({
    clearLocalData: () => Promise.resolve(false),
    continueToNextPreviewDay: () => undefined,
    getNowIso: (realNow) => realNow.toISOString(),
    getState: () => state,
    importMarkdown: () => Promise.resolve({ ignoredCount: 0, importedTopicCount: 0 }),
    subscribe: () => () => undefined
  } satisfies DemoRuntimeController);
}

it('uses the true review queue head when it is live', () => {
  expect(
    resolveResumeReviewNodeId({
      nodesById: createNodeRecord(['review-1', 'review-2']),
      queueNodeIds: ['review-1', 'review-2'],
      reviewSession: createSession(),
      trashedNodeIds: []
    })
  ).toBe('review-1');
});

it('falls back to the next true queue item when the head is stale', () => {
  expect(
    resolveResumeReviewNodeId({
      nodesById: createNodeRecord(['review-2']),
      queueNodeIds: ['stale-review', 'review-2'],
      reviewSession: createSession({ currentNodeId: 'stale-review' }),
      trashedNodeIds: []
    })
  ).toBe('review-2');
});

it('skips trashed queued nodes when resuming a stale review item', () => {
  expect(
    resolveResumeReviewNodeId({
      nodesById: createNodeRecord(['review-1', 'review-2']),
      queueNodeIds: ['review-1', 'review-2'],
      reviewSession: createSession({ currentNodeId: 'stale-review' }),
      trashedNodeIds: ['review-1']
    })
  ).toBe('review-2');
});

it('uses the persisted session current item when it is still in the resume queue', () => {
  expect(
    resolveResumeReviewNodeId({
      nodesById: createNodeRecord(['panel-1', 'review-1']),
      queueNodeIds: ['panel-1', 'review-1'],
      reviewSession: createSession({ currentNodeId: 'review-1' }),
      trashedNodeIds: []
    })
  ).toBe('review-1');
});

it('does not recover future fsrs cards that are absent from the true queue', () => {
  expect(
    resolveResumeReviewNodeId({
      nodesById: createNodeRecord(['review-future', 'review-due']),
      queueNodeIds: ['review-due'],
      reviewSession: createSession({ currentNodeId: 'review-future' }),
      trashedNodeIds: []
    })
  ).toBe('review-due');
});

it('shows a notice when resume has no available Flow entry', () => {
  installDemoRuntime(false);
  const resumeReviewSession = vi.fn(() => false);
  const { result } = renderHook(() =>
    useResumeReviewItem({
      controller: {
        externalView: { closeExternalView: vi.fn() },
        nav: { handleSelectNode: vi.fn() },
        runtime: {
          flushPendingEditorDraft: vi.fn(),
          setIsViewingTrashNode: vi.fn()
        },
        trash: { closeTrashView: vi.fn() },
        virtualView: { closeVirtualView: vi.fn() }
      } as never,
      nowIso: '2026-03-10T12:00:00.000Z',
      reviewSettings: { isReviewSchedulerSettingsReady: true, reviewSchedulerSettings: { pushQueue: {} } } as never,
      ws: {
        nodeOrder: [],
        nodesById: {},
        resumeReviewSession,
        reviewSession: createSession({ currentNodeId: null, queueNodeIds: [], totalNodeCount: 0 }),
        reviewSessionMode: 'recommended',
        trashedNodeIds: []
      } as never
    })
  );

  act(() => result.current());

  expect(resumeReviewSession).not.toHaveBeenCalled();
  expect(showAppRuntimeNotice).toHaveBeenCalledWith(RESUME_REVIEW_UNAVAILABLE_NOTICE);
});
