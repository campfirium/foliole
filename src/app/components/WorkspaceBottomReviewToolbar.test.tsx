import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import {
  selectWorkspaceBottomReviewToolbarProps,
  WorkspaceBottomReviewToolbar,
  type WorkspaceBottomReviewToolbarProps
} from './WorkspaceBottomReviewToolbar';

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
    reviewQueueCount: 2,
    reviewStatus: 'awaiting-answer',
    reviewSessionMode: 'recommended',
    onCompleteReviewItem: vi.fn(() => true),
    onContinueReading: vi.fn(),
    onDeferReviewItem: vi.fn(() => true),
    onDismissReviewItem: vi.fn(() => true),
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
  render(<WorkspaceBottomReviewToolbar {...createProps({ isListCollapsed: true })} />);

  expect(screen.queryByText('2 left · 0 done')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Show Answer' })).toBeInTheDocument();
  expect(screen.getByLabelText('Review mode toolbar')).toHaveClass('col-start-3');
});

it('keeps the review footer list summary when the left sidebar is expanded', () => {
  render(<WorkspaceBottomReviewToolbar {...createProps()} />);

  expect(screen.queryByRole('button', { name: 'Change session mode' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Reading time (coming soon)')).not.toBeInTheDocument();
  expect(screen.getByLabelText("Today's review: 2 left · 0 done · 2 total")).toBeInTheDocument();
  expect(screen.getByLabelText('Review mode toolbar')).toHaveClass('col-start-3');
});

it('keeps the session mode controls hidden while waiting to reveal an answer', () => {
  render(<WorkspaceBottomReviewToolbar {...createProps({ isListCollapsed: true })} />);

  expect(screen.queryByRole('button', { name: 'Change session mode' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Reading time (coming soon)')).not.toBeInTheDocument();
  expect(screen.queryByText('2 left · 0 done')).not.toBeInTheDocument();
});

it('shows session mode controls after an answer is revealed for grading', () => {
  render(<WorkspaceBottomReviewToolbar {...createProps({ isAnswerRevealed: true, reviewStatus: 'answer-revealed' })} />);

  expect(screen.getByRole('button', { name: 'Change session mode' })).toBeInTheDocument();
  expect(screen.getByLabelText('Reading time (coming soon)')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Good' })).toBeInTheDocument();
});

it('shows session mode choices and marks temporary mode in the real footer summary', async () => {
  const onSetReviewSessionMode = vi.fn();
  const { rerender } = render(
    <WorkspaceBottomReviewToolbar
      {...createProps({ isAnswerRevealed: true, onSetReviewSessionMode, reviewStatus: 'answer-revealed' })}
    />
  );

  await act(async () => {
    const button = screen.getByRole('button', { name: 'Change session mode' });
    fireEvent.pointerDown(button, { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.click(button);
  });
  expect(screen.getByRole('menuitem', { name: /Recommended flow/ })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /Review items first/ })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /Reading only/ })).toBeInTheDocument();

  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', { name: /Review items first/ }));
  });
  expect(onSetReviewSessionMode).toHaveBeenCalledWith('review-first');
  rerender(
    <WorkspaceBottomReviewToolbar
      {...createProps({ isAnswerRevealed: true, reviewSessionMode: 'review-first', reviewStatus: 'answer-revealed' })}
    />
  );
  expect(screen.getByRole('button', { name: 'Session mode: Review items first' })).toBeInTheDocument();
  expect(screen.queryByText('Review items first')).not.toBeInTheDocument();
  expect(screen.getByLabelText("Today's review: 2 left · 0 done · 2 total")).toBeInTheDocument();
});

it('replaces review actions with resume when the current review item is not visible', () => {
  const onResumeReviewItem = vi.fn();
  render(
    <WorkspaceBottomReviewToolbar
      {...createProps({ isCurrentReviewItemVisible: false, onResumeReviewItem })}
    />
  );

  expect(screen.getByLabelText("Today's review: 2 left · 0 done · 2 total")).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Resume review' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Show Answer' })).not.toBeInTheDocument();

  screen.getByRole('button', { name: 'Resume review' }).click();
  expect(onResumeReviewItem).toHaveBeenCalledTimes(1);
});

it('hides the footer progress line after review completion', () => {
  const onContinueReading = vi.fn();
  render(
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

  expect(screen.getByText('Review complete')).toBeInTheDocument();
  expect(screen.queryByLabelText("Today's review: 0 left · 2 done · 2 total")).not.toBeInTheDocument();

  screen.getByRole('button', { name: 'Resume review' }).click();
  expect(onContinueReading).toHaveBeenCalledTimes(1);
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
