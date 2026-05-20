import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { ReviewModeToolbar } from './ReviewModeToolbar';

function renderToolbar(overrides: Partial<Parameters<typeof ReviewModeToolbar>[0]> = {}) {
  return render(
    <ReviewModeToolbar
      isAnswerRevealed={false}
      isCurrentItemGradable={false}
      isCurrentReviewItemVisible
      isReviewEditing={false}
      isStudyMode
      reviewCompletedCount={0}
      onCompleteReviewItem={vi.fn(() => true)}
      onContinueReading={vi.fn()}
      onDeferReviewItem={vi.fn(() => true)}
      onDismissReviewItem={vi.fn(() => true)}
      onExitReviewMode={vi.fn()}
      onGrade={vi.fn(async () => true)}
      onRevealAnswer={vi.fn()}
      onResumeReviewItem={vi.fn()}
      onSetReviewSessionMode={vi.fn()}
      reviewCurrentNodeId="node-1"
      reviewCurrentTitle={undefined}
      reviewQueueCount={3}
      reviewStatus="awaiting-answer"
      reviewSessionMode="recommended"
      {...overrides}
    />
  );
}

it('renders reading actions with session controls and hidden progress text', () => {
  renderToolbar({ showSessionModeControl: true, showSummary: false });

  expect(document.querySelector('[data-review-item-kind="reading"]')).toBeInTheDocument();
  expect(screen.getByLabelText('Reading review actions')).toBeInTheDocument();
  expect(screen.getByLabelText('Change session mode')).toBeInTheDocument();
  expect(screen.getByLabelText('Reading time (coming soon)')).toBeInTheDocument();
  expect(screen.getByLabelText("Today's review: 3 left · 0 done · 3 total")).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Later' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Read' })).toBeInTheDocument();
  expect(screen.queryByText('3 left · 0 done')).not.toBeInTheDocument();

  fireEvent.click(screen.getByLabelText('Change session mode'));
  expect(screen.getByText('This session')).toBeInTheDocument();
});

it('keeps legacy summary text when session controls are not shown', () => {
  renderToolbar();

  expect(screen.getByText('3 left · 0 done')).toBeInTheDocument();
});

it('switches to fsrs reveal and grade actions in the shared review action bar', async () => {
  const onRevealAnswer = vi.fn();
  const onGrade = vi.fn(async () => true);
  const { rerender } = renderToolbar({ isCurrentItemGradable: true, onGrade, onRevealAnswer, showSessionModeControl: true });

  expect(document.querySelector('[data-review-item-kind="fsrs"]')).toBeInTheDocument();
  expect(screen.queryByLabelText('Change session mode')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Reading time (coming soon)')).not.toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Show Answer' }));
  });
  expect(screen.getByLabelText('Item reveal actions')).toBeInTheDocument();
  expect(onRevealAnswer).toHaveBeenCalledTimes(1);

  rerender(
    <ReviewModeToolbar
      isAnswerRevealed
      isCurrentItemGradable
      isCurrentReviewItemVisible
      isReviewEditing={false}
      isStudyMode
      reviewCompletedCount={0}
      onCompleteReviewItem={vi.fn(() => true)}
      onContinueReading={vi.fn()}
      onDeferReviewItem={vi.fn(() => true)}
      onDismissReviewItem={vi.fn(() => true)}
      onExitReviewMode={vi.fn()}
      onGrade={onGrade}
      onRevealAnswer={onRevealAnswer}
      onResumeReviewItem={vi.fn()}
      onSetReviewSessionMode={vi.fn()}
      reviewCurrentNodeId="node-1"
      reviewCurrentTitle={undefined}
      reviewQueueCount={1}
      reviewStatus="answer-revealed"
      reviewSessionMode="recommended"
      showSessionModeControl
    />
  );

  expect(screen.getByLabelText('Change session mode')).toBeInTheDocument();
  expect(screen.getByLabelText('Reading time (coming soon)')).toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Good' }));
  });
  expect(screen.getByLabelText('Review grade actions')).toBeInTheDocument();
  expect(onGrade).toHaveBeenCalledWith(3);
});

it('shows a retry action when saving a grade fails', async () => {
  const onGrade = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  renderToolbar({
    isAnswerRevealed: true,
    isCurrentItemGradable: true,
    onGrade
  });

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Hard' }));
  });

  expect(screen.getByText('Failed to save grade. Please retry.')).toBeInTheDocument();

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  });

  expect(onGrade).toHaveBeenNthCalledWith(1, 2);
  expect(onGrade).toHaveBeenNthCalledWith(2, 2);
});

it('shows only resume when the visible topic is outside the current review item', () => {
  const onResumeReviewItem = vi.fn();
  renderToolbar({
    isCurrentReviewItemVisible: false,
    onResumeReviewItem,
    reviewCurrentTitle: 'Current topic'
  });

  expect(screen.getByText('Review paused · Current topic')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Resume review' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Later' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Resume review' }));
  expect(onResumeReviewItem).toHaveBeenCalledTimes(1);
});

it('shows completed without progress and continues reading when the review phase is complete', () => {
  const onContinueReading = vi.fn();
  renderToolbar({
    onContinueReading,
    reviewCompletedCount: 3,
    reviewCurrentNodeId: null,
    reviewQueueCount: 0,
    reviewStatus: 'completed'
  });

  expect(screen.queryByText('Review complete')).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Today's review: 0 left · 3 done · 3 total")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Continue reading' }));
  expect(onContinueReading).toHaveBeenCalledTimes(1);
});

it('resumes from the queue when study mode has no current item but queued items exist', () => {
  const onContinueReading = vi.fn();
  const onResumeReviewItem = vi.fn();
  renderToolbar({
    onContinueReading,
    onResumeReviewItem,
    reviewCurrentNodeId: null,
    reviewQueueCount: 3,
    reviewStatus: 'idle'
  });

  fireEvent.click(screen.getByRole('button', { name: 'Resume review' }));
  expect(onResumeReviewItem).toHaveBeenCalledTimes(1);
  expect(onContinueReading).not.toHaveBeenCalled();
});

it('keeps an empty dev-restored status bar in idle study mode', () => {
  renderToolbar({
    reviewCurrentNodeId: null,
    reviewQueueCount: 0,
    reviewStatus: 'idle'
  });

  expect(screen.getByText('Study mode')).toBeInTheDocument();
  expect(screen.queryByText('Review complete')).not.toBeInTheDocument();
});
