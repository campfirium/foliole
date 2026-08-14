import { expect, it, vi } from 'vitest';

import { selectWorkspaceBottomReviewToolbarProps, type WorkspaceBottomReviewToolbarProps } from './WorkspaceBottomReviewToolbar';

function createReviewProps(overrides: Partial<WorkspaceBottomReviewToolbarProps> = {}): WorkspaceBottomReviewToolbarProps {
  return {
    canStartStudyMode: true,
    isAnswerRevealed: false,
    isCurrentReviewItemGradable: true,
    isCurrentReviewItemVisible: true,
    isImmersiveMode: false,
    isListCollapsed: false,
    isReviewEditing: false,
    isSequentialReadingReviewTopic: false,
    isStudyMode: true,
    editorAdapterRef: { current: null },
    onContinueReading: vi.fn(),
    onDismissReviewTopic: vi.fn(async () => true),
    onExitReviewMode: vi.fn(),
    onGradeReview: vi.fn(async () => true),
    onPostponeReviewTopic: vi.fn(async () => true),
    onReadReviewTopic: vi.fn(async () => true),
    onResumeReviewItem: vi.fn(),
    onRevealAnswer: vi.fn(),
    onRevisitReviewTopicSoon: vi.fn(async () => true),
    onSetReviewSessionMode: vi.fn(),
    onToggleReviewSession: vi.fn(),
    reviewCompletedCount: 0,
    reviewCurrentNodeId: 'node-1',
    reviewCurrentTitle: 'Review topic',
    reviewPreview: null,
    reviewProgressCounts: { completedItemCount: 0, completedTopicCount: 0, queuedItemCount: 2, queuedTopicCount: 0 },
    reviewQueueCount: 2,
    reviewSessionMode: 'recommended',
    reviewStatus: 'awaiting-answer',
    reviewSummary: {
      canContinueReading: false,
      completedAt: null,
      continueNodeId: null,
      createdItemCount: 0,
      createdTopicCount: 0,
      nextReviewDueAt: null,
      readingElapsedMs: 0,
      readTopicCount: 0,
      reviewElapsedMs: 0,
      reviewedItemCount: 0,
      sessionStartedAt: null
    },
    ...overrides
  };
}

it('treats external, trash, and virtual surfaces as paused review surfaces', () => {
  const onOpenNotesView = vi.fn();
  const onSelectNode = vi.fn();
  const onResumeReviewItem = vi.fn();
  const source = {
    document: { editorAdapterRef: { current: null } },
    externalLibrary: { isExternalViewOpen: true },
    layoutChrome: { isImmersiveMode: false, isListCollapsed: false },
    navigation: { activeNodeId: 'node-1', onSelectNode },
    nodeList: { nodesById: { 'node-1': { kind: 'item', title: 'Review topic' } }, onOpenNotesView },
    review: { ...createReviewProps({ onResumeReviewItem }), reviewPanelQueueNodeIds: ['node-1'] },
    trash: { isTrashViewOpen: false, isViewingTrashNode: false },
    virtualView: { isVirtualViewOpen: false }
  };

  const externalProps = selectWorkspaceBottomReviewToolbarProps(source as never);
  expect(externalProps.isCurrentReviewItemVisible).toBe(false);
  expect(selectWorkspaceBottomReviewToolbarProps({
    ...source,
    externalLibrary: { isExternalViewOpen: false },
    trash: { isTrashViewOpen: true, isViewingTrashNode: true }
  } as never).isCurrentReviewItemVisible).toBe(false);
  expect(selectWorkspaceBottomReviewToolbarProps({
    ...source,
    externalLibrary: { isExternalViewOpen: false },
    virtualView: { isVirtualViewOpen: true }
  } as never).isCurrentReviewItemVisible).toBe(false);

  externalProps.onResumeReviewItem();
  expect(onResumeReviewItem).toHaveBeenCalledTimes(1);
  expect(onOpenNotesView).not.toHaveBeenCalled();
  expect(onSelectNode).not.toHaveBeenCalled();
});

it('treats a different queued topic as a paused review surface', () => {
  const source = {
    document: { editorAdapterRef: { current: null } },
    externalLibrary: { isExternalViewOpen: false },
    layoutChrome: { isImmersiveMode: false, isListCollapsed: false },
    navigation: { activeNodeId: 'node-2', onSelectNode: vi.fn() },
    nodeList: { nodesById: { 'node-1': { kind: 'item', title: 'Review topic' } }, onOpenNotesView: vi.fn() },
    review: { ...createReviewProps({ reviewCurrentNodeId: 'node-1' }), reviewPanelQueueNodeIds: ['node-1'] },
    trash: { isTrashViewOpen: false, isViewingTrashNode: false },
    virtualView: { isVirtualViewOpen: false }
  };

  expect(selectWorkspaceBottomReviewToolbarProps(source as never).isCurrentReviewItemVisible).toBe(false);
});
