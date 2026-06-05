import { act, fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { selectWorkspaceBottomReviewToolbarProps, WorkspaceBottomReviewToolbar, type WorkspaceBottomReviewToolbarProps } from './WorkspaceBottomReviewToolbar';

const progressCounts = (completedItemCount: number, completedTopicCount: number, queuedItemCount: number, queuedTopicCount: number) => ({ completedItemCount, completedTopicCount, queuedItemCount, queuedTopicCount });

function createProps(overrides: Partial<WorkspaceBottomReviewToolbarProps> = {}): WorkspaceBottomReviewToolbarProps {
  return {
    canStartStudyMode: true,
    isAnswerRevealed: false,
    isCurrentReviewItemGradable: true,
    isImmersiveMode: false,
    isListCollapsed: false,
    isReviewEditing: false,
    isStudyMode: true,
    isCurrentReviewItemVisible: true,
    reviewCompletedCount: 0,
    reviewCurrentNodeId: 'node-1',
    reviewCurrentTitle: 'Review topic',
    reviewDueCount: 2,
    reviewProgressCounts: progressCounts(0, 0, 2, 0),
    reviewQueueCount: 2,
    reviewSummary: {
      completedAt: null,
      continueNodeId: null,
      createdItemCount: 0,
      createdTopicCount: 0,
      readingElapsedMs: 34 * 60 * 1000,
      readTopicCount: 2,
      reviewElapsedMs: 18 * 60 * 1000,
      reviewedItemCount: 4,
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
    onToggleReviewSession: vi.fn(),
    ...overrides
  };
}

it('collapses the review footer list summary with the left sidebar', () => {
  renderWithLocalization(<WorkspaceBottomReviewToolbar {...createProps({ isListCollapsed: true })} />);

  expect(screen.queryByText('2 left · 0 done')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Show Answer' })).toBeInTheDocument();
  expect(screen.getByLabelText('Flow toolbar')).toHaveClass('col-start-3');
});

it('keeps the review footer list summary when the left sidebar is expanded', () => {
  renderWithLocalization(<WorkspaceBottomReviewToolbar {...createProps()} />);

  expect(screen.queryByRole('button', { name: 'Change session mode' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Queue summary')).not.toBeInTheDocument();
  expect(screen.getByLabelText('i 0/2')).toBeInTheDocument();
  expect(screen.getByLabelText('Flow toolbar')).toHaveClass('col-start-3');
});

it('recalculates the progress total when the active review queue is replanned', () => {
  const { rerender } = renderWithLocalization(
    <WorkspaceBottomReviewToolbar
      {...createProps({
        reviewCompletedCount: 4,
        reviewProgressCounts: progressCounts(4, 0, 6, 0),
        reviewQueueCount: 6
      })}
    />
  );

  expect(screen.getByLabelText('i 4/10')).toBeInTheDocument();

  rerender(
    <WorkspaceBottomReviewToolbar
      {...createProps({
        reviewCompletedCount: 4,
        reviewProgressCounts: progressCounts(4, 0, 3, 0),
        reviewQueueCount: 3
      })}
    />
  );

  expect(screen.getByLabelText('i 4/7')).toBeInTheDocument();
  expect(screen.queryByLabelText('i 4/10')).not.toBeInTheDocument();
});

it('keeps the session mode controls hidden while waiting to reveal an answer', () => {
  renderWithLocalization(<WorkspaceBottomReviewToolbar {...createProps({ isListCollapsed: true })} />);

  expect(screen.queryByRole('button', { name: 'Change session mode' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Queue summary')).not.toBeInTheDocument();
  expect(screen.queryByText('2 left · 0 done')).not.toBeInTheDocument();
});

it('shows session mode controls after an answer is revealed for grading', () => {
  renderWithLocalization(<WorkspaceBottomReviewToolbar {...createProps({ isAnswerRevealed: true, reviewStatus: 'answer-revealed' })} />);

  expect(screen.getByRole('button', { name: 'Change session mode' })).toBeInTheDocument();
  expect(screen.getByLabelText('Queue summary')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Good' })).toBeInTheDocument();
});

it('shows session mode choices and marks temporary mode in the real footer summary', async () => {
  const onSetReviewSessionMode = vi.fn();
  const { rerender } = renderWithLocalization(
    <WorkspaceBottomReviewToolbar
      {...createProps({
        isAnswerRevealed: true,
        onSetReviewSessionMode,
        reviewStatus: 'answer-revealed'
      })}
    />
  );

  await act(async () => {
    const button = screen.getByRole('button', { name: 'Change session mode' });
    fireEvent.pointerDown(button, { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.click(button);
  });
  expect(screen.getByRole('menuitem', { name: /Review and reading/ })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /Review first/ })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /Reading only/ })).toBeInTheDocument();
  expect(screen.queryByText('Flow mode')).not.toBeInTheDocument();
  expect(screen.queryByText('Handle due review items before reading.')).not.toBeInTheDocument();
  expect(screen.getByText('RECOMMENDED')).toBeInTheDocument();
  expect(screen.getByText('Temporary setting.')).toBeInTheDocument();

  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', { name: /Review first/ }));
  });
  expect(onSetReviewSessionMode).toHaveBeenCalledWith('review-first');
  rerender(
    <WorkspaceBottomReviewToolbar
      {...createProps({
        isAnswerRevealed: true,
        reviewSessionMode: 'review-first',
        reviewStatus: 'answer-revealed'
      })}
    />
  );
  expect(screen.getByRole('button', { name: 'Session mode: Review first' })).toBeInTheDocument();
  expect(screen.queryByText('Review first')).not.toBeInTheDocument();
  expect(screen.getByLabelText('i 0/2')).toBeInTheDocument();
});

it('replaces review actions with resume when the current review item is not visible', () => {
  const onResumeReviewItem = vi.fn();
  renderWithLocalization(<WorkspaceBottomReviewToolbar {...createProps({ isCurrentReviewItemVisible: false, onResumeReviewItem })} />);

  expect(screen.getByLabelText('i 0/2')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Resume review' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Show Answer' })).not.toBeInTheDocument();

  screen.getByRole('button', { name: 'Resume review' }).click();
  expect(onResumeReviewItem).toHaveBeenCalledTimes(1);
});

it('hides the footer progress line after review completion', () => {
  const onContinueReading = vi.fn();
  renderWithLocalization(
    <WorkspaceBottomReviewToolbar
      {...createProps({
        onContinueReading,
        reviewCompletedCount: 2,
        reviewCurrentNodeId: null,
        reviewQueueCount: 0,
        reviewStatus: 'completed'
      })}
    />
  );

  expect(screen.getByRole('button', { name: 'Queue clear' })).toBeInTheDocument();
  expect(screen.queryByLabelText('i 2/2')).not.toBeInTheDocument();

  screen.getByRole('button', { name: 'Continue reading' }).click();
  expect(onContinueReading).toHaveBeenCalledTimes(1);
});

it('hides the footer progress line while handling pushed reading topics', () => {
  renderWithLocalization(
    <WorkspaceBottomReviewToolbar
      {...createProps({
        isCurrentReviewItemGradable: false,
        reviewCurrentTitle: 'Reading topic',
        reviewQueueCount: 12
      })}
    />
  );

  expect(screen.getByRole('button', { name: 'Read' })).toBeInTheDocument();
  expect(screen.queryByLabelText('i 0/12')).not.toBeInTheDocument();
});

it('treats external, trash, and virtual surfaces as paused review surfaces', () => {
  const onOpenNotesView = vi.fn();
  const onSelectNode = vi.fn();
  const onResumeReviewItem = vi.fn();
  const source = {
    externalLibrary: { isExternalViewOpen: true },
    layoutChrome: { isImmersiveMode: false, isListCollapsed: false },
    navigation: { activeNodeId: 'node-1', onSelectNode },
    nodeList: { nodesById: { 'node-1': { title: 'Review topic' } }, onOpenNotesView },
    review: createProps({ onResumeReviewItem }),
    trash: { isTrashViewOpen: false, isViewingTrashNode: false },
    virtualView: { isVirtualViewOpen: false }
  };

  const externalProps = selectWorkspaceBottomReviewToolbarProps(source as never);
  expect(externalProps.isCurrentReviewItemVisible).toBe(false);

  const trashProps = selectWorkspaceBottomReviewToolbarProps({
    ...source,
    externalLibrary: { isExternalViewOpen: false },
    trash: { isTrashViewOpen: true, isViewingTrashNode: true }
  } as never);
  expect(trashProps.isCurrentReviewItemVisible).toBe(false);

  const virtualProps = selectWorkspaceBottomReviewToolbarProps({
    ...source,
    externalLibrary: { isExternalViewOpen: false },
    virtualView: { isVirtualViewOpen: true }
  } as never);
  expect(virtualProps.isCurrentReviewItemVisible).toBe(false);

  externalProps.onResumeReviewItem();
  expect(onResumeReviewItem).toHaveBeenCalledTimes(1);
  expect(onOpenNotesView).not.toHaveBeenCalled();
  expect(onSelectNode).not.toHaveBeenCalled();
});

it('treats a different queued topic as a paused review surface', () => {
  const source = {
    externalLibrary: { isExternalViewOpen: false },
    layoutChrome: { isImmersiveMode: false, isListCollapsed: false },
    navigation: { activeNodeId: 'node-2', onSelectNode: vi.fn() },
    nodeList: { nodesById: { 'node-1': { title: 'Review topic' } }, onOpenNotesView: vi.fn() },
    review: createProps({ reviewCurrentNodeId: 'node-1' }),
    trash: { isTrashViewOpen: false, isViewingTrashNode: false },
    virtualView: { isVirtualViewOpen: false }
  };

  expect(selectWorkspaceBottomReviewToolbarProps(source as never).isCurrentReviewItemVisible).toBe(false);
});
