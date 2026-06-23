import { expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../features/settings/model/reviewSchedulerSettings';
import type { ReviewSessionState } from '../../store/workspaceStore';

import { buildLayoutProps, countCreatedNodesDuringSession } from './layoutPropsBuilder';
import type { BuildLayoutPropsArgs } from './layoutPropsBuilderTypes';

function createNode(id: string, kind: Node['kind'], createdAt: string): Node {
  return {
    content: '',
    createdAt,
    id,
    kind,
    parentNodeId: null,
    reveal: null,
    review: null,
    title: id,
    updatedAt: createdAt
  };
}

const reviewGateLayoutArgs = {
  activeNodeId: null,
  canGoBack: false,
  canGoForward: false,
  canGoParent: false,
  canStartStudyMode: true,
  contextMenu: null,
  editorAdapterRef: { current: null },
  editorCtx: {},
  editorNodeId: null,
  editorNodeViewState: null,
  isExternalViewOpen: false,
  isImmersiveMode: false,
  isImportManagementOpen: false,
  isListCollapsed: false,
  isPriorityQuickSetActive: false,
  isResizingList: false,
  isResizingRightSidebar: false,
  isReviewEditing: false,
  isRightSidebarCollapsed: false,
  isSettingsOpen: false,
  isStudyMode: false,
  isTrashViewOpen: false,
  isViewingTrashNode: false,
  isVirtualViewOpen: false,
  isWorkspaceHydrated: true,
  listWidth: 320,
  nav: {},
  nodeOrder: ['review-1'],
  nodesById: {
    'review-1': {
      ...createNode('review-1', 'item', '2026-03-03T12:00:00.000Z'),
      review: { due: '2026-03-03T00:00:00.000Z' } as never
    }
  },
  nowIso: '2026-03-03T12:00:00.000Z',
  requestedSettingsCategory: null,
  requestedSettingsDialog: null,
  reviewPreview: null,
  reviewSession: {
    currentNodeId: null,
    isAnswerRevealed: false,
    queueNodeIds: ['review-1'],
    totalNodeCount: 1
  },
  reviewSessionMode: 'recommended',
  reviewSettings: {
    isReviewSchedulerSettingsReady: false,
    reviewSchedulerSettings: DEFAULT_REVIEW_SCHEDULER_SETTINGS
  },
  rightSidebarWidth: 320,
  selectedTrashNodeId: null,
  showAnswerSection: false,
  trashedNodeIds: []
} as const;

it('counts created items and topics inside the completed review session window', () => {
  const reviewSession: ReviewSessionState = {
    completedAt: '2026-03-03T12:30:00.000Z',
    currentNodeId: null,
    isAnswerRevealed: false,
    queueNodeIds: [],
    sessionStartedAt: '2026-03-03T12:00:00.000Z',
    totalNodeCount: 1
  };

  expect(countCreatedNodesDuringSession(reviewSession, {
    folder: createNode('folder', 'folder', '2026-03-03T12:10:00.000Z'),
    item: createNode('item', 'item', '2026-03-03T12:18:00.000Z'),
    late: createNode('late', 'topic', '2026-03-03T12:31:00.000Z'),
    topic: createNode('topic', 'topic', '2026-03-03T12:20:00.000Z')
  })).toEqual({ createdItemCount: 1, createdTopicCount: 1 });
});

it('does not derive review queue state from default scheduler settings before settings are ready', () => {
  const startReviewSession = vi.fn(() => true);
  const props = buildLayoutProps({
    ...reviewGateLayoutArgs,
    startReviewSession,
  } as unknown as BuildLayoutPropsArgs);

  expect(props.review.canStartStudyMode).toBe(false);
  expect(props.review.reviewPanelQueueNodeIds).toEqual([]);
  expect(props.review.reviewFlowWindow).toEqual({
    dayBuckets: [],
    dayOffsetByNodeId: {},
    queueNodeIds: [],
    readyNodeIds: [],
    upcomingNodeIds: []
  });
  expect(props.review.reviewQueueNodeIds).toEqual([]);
  expect(props.review.reviewQueueVisibility).toBeNull();
  expect(props.review.reviewQueueCount).toBe(0);

  props.review.onStartStudyMode();
  expect(startReviewSession).not.toHaveBeenCalled();
});

it('does not enter review mode from the explicit exit action', () => {
  const exitReviewSession = vi.fn();
  const exitStudyMode = vi.fn();
  const startReviewSession = vi.fn(() => false);
  const props = buildLayoutProps({
    ...reviewGateLayoutArgs,
    exitReviewSession,
    exitStudyMode,
    isStudyMode: false,
    reviewSettings: {
      isReviewSchedulerSettingsReady: true,
      reviewSchedulerSettings: DEFAULT_REVIEW_SCHEDULER_SETTINGS
    },
    startReviewSession
  } as unknown as BuildLayoutPropsArgs);

  props.review.onExitReviewMode();

  expect(exitReviewSession).toHaveBeenCalledTimes(1);
  expect(exitStudyMode).toHaveBeenCalledTimes(1);
  expect(startReviewSession).not.toHaveBeenCalled();
});

it('changes review session mode with the controller clock', () => {
  const nowIso = '2026-06-21T12:00:00.000Z';
  const setReviewSessionMode = vi.fn();
  const props = buildLayoutProps({
    ...reviewGateLayoutArgs,
    nowIso,
    reviewSettings: {
      isReviewSchedulerSettingsReady: true,
      reviewSchedulerSettings: DEFAULT_REVIEW_SCHEDULER_SETTINGS
    },
    setReviewSessionMode
  } as unknown as BuildLayoutPropsArgs);

  props.review.onSetReviewSessionMode('reading-only');

  expect(setReviewSessionMode).toHaveBeenCalledWith('reading-only', nowIso);
});

it('continues queue-clear reading through the current Flow checkpoint', () => {
  const nowIso = '2026-06-21T12:00:00.000Z';
  const onOpenNotesView = vi.fn();
  const onSelectNode = vi.fn();
  const continueReviewSessionReading = vi.fn(() => true);
  const exitReviewSession = vi.fn();
  const props = buildLayoutProps({
    ...reviewGateLayoutArgs,
    activeNodeId: 'review-1',
    continueReviewSessionReading,
    exitReviewSession,
    isStudyMode: true,
    nav: { onSelectNode },
    nodesById: {
      ...reviewGateLayoutArgs.nodesById,
      'reading-1': createNode('reading-1', 'topic', nowIso)
    },
    nowIso,
    onOpenNotesView,
    reviewSession: {
      completedAt: nowIso,
      continueNodeId: 'reading-1',
      currentNodeId: null,
      isAnswerRevealed: false,
      queueNodeIds: [],
      reviewedItemCount: 1,
      totalNodeCount: 1
    },
    reviewSettings: {
      isReviewSchedulerSettingsReady: true,
      reviewSchedulerSettings: DEFAULT_REVIEW_SCHEDULER_SETTINGS
    },
    startReviewSession: vi.fn(() => false)
  } as unknown as BuildLayoutPropsArgs);

  props.review.onContinueReading();

  expect(onOpenNotesView).toHaveBeenCalledTimes(1);
  expect(onSelectNode).toHaveBeenCalledWith('reading-1');
  expect(continueReviewSessionReading).toHaveBeenCalledWith(nowIso);
  expect(exitReviewSession).not.toHaveBeenCalled();
});

it('does not mark a pure reading completion as queue-clear continuation', () => {
  const nowIso = '2026-06-21T12:00:00.000Z';
  const props = buildLayoutProps({
    ...reviewGateLayoutArgs,
    activeNodeId: 'reading-1',
    nodesById: {
      ...reviewGateLayoutArgs.nodesById,
      'reading-1': createNode('reading-1', 'topic', nowIso)
    },
    reviewFlowWindow: undefined,
    reviewSession: {
      completedAt: nowIso,
      continueNodeId: 'reading-1',
      currentNodeId: null,
      isAnswerRevealed: false,
      queueNodeIds: [],
      readTopicCount: 1,
      reviewedItemCount: 0,
      totalNodeCount: 1
    },
    reviewSettings: {
      isReviewSchedulerSettingsReady: true,
      reviewSchedulerSettings: DEFAULT_REVIEW_SCHEDULER_SETTINGS
    }
  } as unknown as BuildLayoutPropsArgs);

  expect(props.review.reviewSummary.canContinueReading).toBe(false);
});
