import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { installDemoRuntimeController, type DemoRuntimeController } from '../../shared/platform/runtime/demoRuntime';
import type { ReviewSessionState } from '../../store/workspaceStore';

import { useResumeReviewItem } from './useResumeReviewItem';

function createFlowTopic(id: string, nextAt: string): Node {
  return {
    id,
    parentNodeId: null,
    kind: 'topic',
    title: id,
    content: `${id} body`,
    reveal: null,
    review: null,
    reading: {
      intervalDurationMs: 24 * 60 * 60 * 1000,
      intervalGrowthFactor: 1.3,
      lastHandledAt: '2026-03-01T00:00:00.000Z',
      nextAt,
      priority: 5,
      readingPosition: 0,
      repetitionCount: 1,
      state: 'active'
    },
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z'
  };
}

function createSession(): ReviewSessionState {
  return {
    currentNodeId: null,
    isAnswerRevealed: false,
    queueNodeIds: [],
    totalNodeCount: 0
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

function renderResumeHook(args: {
  activeNodeId: string;
  isDemo: boolean;
  nodesById: Record<string, Node>;
  nodeOrder: string[];
  reviewSessionMode: 'reading-only' | 'recommended';
}) {
  installDemoRuntime(args.isDemo);
  const resumeReviewSession = vi.fn(() => true);
  const handleSelectNode = vi.fn();
  const hook = renderHook(() =>
    useResumeReviewItem({
      controller: {
        externalView: { closeExternalView: vi.fn() },
        nav: { handleSelectNode },
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
        activeNodeId: args.activeNodeId,
        nodeOrder: args.nodeOrder,
        nodesById: args.nodesById,
        resumeReviewSession,
        reviewSession: createSession(),
        reviewSessionMode: args.reviewSessionMode,
        trashedNodeIds: []
      } as never
    })
  );
  return { handleSelectNode, hook, resumeReviewSession };
}

it('resumes the active Flow topic instead of falling back to the queue head', () => {
  const { handleSelectNode, hook, resumeReviewSession } = renderResumeHook({
    activeNodeId: 'topic-2',
    isDemo: false,
    nodeOrder: ['topic-1', 'topic-2'],
    nodesById: {
      'topic-1': createFlowTopic('topic-1', '2026-03-09T00:00:00.000Z'),
      'topic-2': createFlowTopic('topic-2', '2026-03-09T00:00:00.000Z')
    },
    reviewSessionMode: 'reading-only'
  });

  act(() => hook.result.current());

  expect(resumeReviewSession).toHaveBeenCalledWith('2026-03-10T12:00:00.000Z', {
    includeScheduledFallback: false,
    preferredNodeId: 'topic-2'
  });
  expect(handleSelectNode).toHaveBeenCalledWith('topic-2', null, 'target-context');
});

it('lets Demo resume the active scheduled Flow topic', () => {
  const { handleSelectNode, hook, resumeReviewSession } = renderResumeHook({
    activeNodeId: 'topic-future',
    isDemo: true,
    nodeOrder: ['topic-soon', 'topic-future'],
    nodesById: {
      'topic-soon': createFlowTopic('topic-soon', '2026-03-11T00:00:00.000Z'),
      'topic-future': createFlowTopic('topic-future', '2026-03-12T00:00:00.000Z')
    },
    reviewSessionMode: 'recommended'
  });

  act(() => hook.result.current());

  expect(resumeReviewSession).toHaveBeenCalledWith('2026-03-10T12:00:00.000Z', {
    includeScheduledFallback: true,
    preferredNodeId: 'topic-future'
  });
  expect(handleSelectNode).toHaveBeenCalledWith('topic-future', null, 'target-context');
});
