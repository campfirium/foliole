import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { WorkspaceBottomReviewToolbar, type WorkspaceBottomReviewToolbarProps } from './WorkspaceBottomReviewToolbar';

function createImmersiveProps(): WorkspaceBottomReviewToolbarProps {
  return {
    canStartStudyMode: true,
    isAnswerRevealed: false,
    isCurrentReviewItemGradable: true,
    isImmersiveMode: true,
    isListCollapsed: false,
    isReviewEditing: false,
    isStudyMode: true,
    isCurrentReviewItemVisible: true,
    isSequentialReadingReviewTopic: false,
    editorAdapterRef: { current: null },
    reviewCompletedCount: 0,
    reviewCurrentNodeId: 'node-1',
    reviewCurrentTitle: 'Review topic',
    reviewProgressCounts: {
      completedItemCount: 0,
      completedTopicCount: 0,
      queuedItemCount: 2,
      queuedTopicCount: 0
    },
    reviewPreview: null,
    reviewQueueCount: 2,
    reviewSummary: {
      canContinueReading: false,
      completedAt: null,
      continueNodeId: null,
      createdItemCount: 0,
      createdTopicCount: 0,
      readingElapsedMs: 0,
      readTopicCount: 0,
      reviewElapsedMs: 0,
      reviewedItemCount: 0,
      nextReviewDueAt: null,
      sessionStartedAt: '2026-03-10T12:00:00.000Z'
    },
    reviewStatus: 'awaiting-answer',
    reviewSessionMode: 'recommended',
    onReadReviewTopic: vi.fn(async () => true),
    onContinueReading: vi.fn(),
    onPostponeReviewTopic: vi.fn(async () => true),
    onDismissReviewTopic: vi.fn(async () => true),
    onRevisitReviewTopicSoon: vi.fn(async () => true),
    onExitReviewMode: vi.fn(),
    onGradeReview: vi.fn(async () => true),
    onRevealAnswer: vi.fn(),
    onResumeReviewItem: vi.fn(),
    onSetReviewSessionMode: vi.fn(),
    onToggleReviewSession: vi.fn()
  };
}

it('uses an opaque overlay surface in immersive review mode', () => {
  const { container } = render(<WorkspaceBottomReviewToolbar {...createImmersiveProps()} />);

  const toolbar = screen.getByLabelText('Flow toolbar');
  expect(container.firstElementChild).toHaveClass('absolute', 'bottom-5');
  expect(container.firstElementChild).not.toHaveClass('row-start-2');
  expect(container.querySelector('.workspace-bottom-region-grid')).toBeNull();
  expect(toolbar).toHaveAttribute('data-surface', 'overlay');
  expect(toolbar.className).toContain('--app-floating-surface-bg');
  expect(toolbar).toHaveClass('border');
  expect(toolbar).toHaveClass('shadow-popover');
  expect(toolbar).toHaveClass('w-fit');
  expect(toolbar).toHaveClass('max-w-[calc(100vw-3rem)]');
  expect(toolbar).toHaveClass('col-start-1');
  expect(toolbar).toHaveClass('pointer-events-auto');
  expect(toolbar).not.toHaveClass('backdrop-blur-md');
  expect(toolbar).not.toHaveClass('border-t');
  expect(toolbar).not.toHaveStyle({ opacity: '0.6' });
});
