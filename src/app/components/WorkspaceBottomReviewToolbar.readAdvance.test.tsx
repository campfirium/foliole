import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceBottomReviewToolbar, type WorkspaceBottomReviewToolbarProps } from './WorkspaceBottomReviewToolbar';

function createEditorAdapter(): EditorAdapter {
  return {
    getScrollMetrics: () => ({
      clientHeight: 500,
      contentPaddingBottom: 700,
      scrollHeight: 2000,
      scrollTop: 700
    }),
    onScroll: () => () => undefined
  } as unknown as EditorAdapter;
}

function createReadingProps(overrides: Partial<WorkspaceBottomReviewToolbarProps> = {}): WorkspaceBottomReviewToolbarProps {
  return {
    canStartStudyMode: true,
    editorAdapterRef: { current: createEditorAdapter() },
    isAnswerRevealed: false,
    isCurrentReviewItemGradable: false,
    isCurrentReviewItemVisible: true,
    isImmersiveMode: false,
    isListCollapsed: false,
    isReviewEditing: false,
    isSequentialReadingReviewTopic: true,
    isStudyMode: true,
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
    reviewCurrentNodeId: 'reading-1',
    reviewCurrentTitle: 'Reading topic',
    reviewPreview: null,
    reviewProgressCounts: { completedItemCount: 0, completedTopicCount: 0, queuedItemCount: 0, queuedTopicCount: 2 },
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

it('emphasizes read and releases sequential reading only when the real content end is reached', async () => {
  const onReadReviewTopic = vi.fn(async () => true);
  renderWithLocalization(<WorkspaceBottomReviewToolbar {...createReadingProps({ onReadReviewTopic })} />);

  const read = screen.getByRole('button', { name: 'Read' });
  await waitFor(() => expect(read).toHaveAttribute('data-advance-ready', 'true'));
  expect(read).toHaveClass('border-2', 'border-border-strong');

  fireEvent.click(read);
  expect(onReadReviewTopic).toHaveBeenCalledWith({ releaseSequentialReading: true });
});
