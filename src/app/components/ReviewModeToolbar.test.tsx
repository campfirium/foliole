import { act, fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { ReviewModeToolbar } from './ReviewModeToolbar';

const progressCounts = (completedItemCount: number, completedTopicCount: number, queuedItemCount: number, queuedTopicCount: number) => ({ completedItemCount, completedTopicCount, queuedItemCount, queuedTopicCount });

function renderToolbar(overrides: Partial<Parameters<typeof ReviewModeToolbar>[0]> = {}) {
  return renderWithLocalization(
    <ReviewModeToolbar
      isAnswerRevealed={false}
      isCurrentItemGradable={false}
      isCurrentReviewItemVisible
      isReviewEditing={false}
      isStudyMode
      reviewCompletedCount={0}
      onReadReviewTopic={vi.fn(async () => true)}
      onContinueReading={vi.fn()}
      onPostponeReviewTopic={vi.fn(async () => true)}
      onDismissReviewTopic={vi.fn(async () => true)}
      onRevisitReviewTopicSoon={vi.fn(async () => true)}
      onExitReviewMode={vi.fn()}
      onGrade={vi.fn(async () => true)}
      onRevealAnswer={vi.fn()}
      onResumeReviewItem={vi.fn()}
      onSetReviewSessionMode={vi.fn()}
      reviewCurrentNodeId="node-1"
      reviewCurrentTitle={undefined}
      reviewProgressCounts={progressCounts(0, 0, 3, 0)}
      reviewPreview={null}
      reviewQueueCount={3}
      reviewSummary={{
        readingElapsedMs: 34 * 60 * 1000,
        readTopicCount: 2,
        reviewElapsedMs: 18 * 60 * 1000,
        reviewedItemCount: 4
      }}
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
  expect(screen.getByLabelText('Queue summary')).toBeInTheDocument();
  expect(screen.getByLabelText('i 0/3')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Soon' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Later' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Read' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  expect(screen.queryByText('3 left · 0 done')).not.toBeInTheDocument();

  fireEvent.click(screen.getByLabelText('Change session mode'));
  expect(screen.queryByText('Flow mode')).not.toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /Review and reading/ })).toBeInTheDocument();
  expect(screen.getByText('RECOMMENDED')).toBeInTheDocument();
  expect(screen.queryByText('Mix review items with reading topics.')).not.toBeInTheDocument();
});

it('passes overlay surface to reading actions inside session controls', () => {
  renderToolbar({ showSessionModeControl: true, showSummary: false, surface: 'overlay' });

  expect(screen.getByLabelText('Reading review actions').className).toContain('[&_button]:!border-0');
  expect(document.querySelectorAll('[data-review-overlay-divider]')).toHaveLength(5);
  expect(screen.getByRole('button', { name: 'Soon' })).toHaveStyle({ border: '0', borderRadius: '0' });
  expect(screen.getByRole('button', { name: 'Soon' })).not.toHaveAttribute('data-active');
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
  expect(screen.queryByLabelText('Queue summary')).not.toBeInTheDocument();
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
      onReadReviewTopic={vi.fn(async () => true)}
      onContinueReading={vi.fn()}
      onPostponeReviewTopic={vi.fn(async () => true)}
      onDismissReviewTopic={vi.fn(async () => true)}
      onRevisitReviewTopicSoon={vi.fn(async () => true)}
      onExitReviewMode={vi.fn()}
      onGrade={onGrade}
      onRevealAnswer={onRevealAnswer}
      onResumeReviewItem={vi.fn()}
      onSetReviewSessionMode={vi.fn()}
      reviewCurrentNodeId="node-1"
      reviewCurrentTitle={undefined}
      reviewPreview={null}
      reviewQueueCount={1}
      reviewSummary={{
        readingElapsedMs: 34 * 60 * 1000,
        readTopicCount: 2,
        reviewElapsedMs: 18 * 60 * 1000,
        reviewedItemCount: 4
      }}
      reviewStatus="answer-revealed"
      reviewSessionMode="recommended"
      showSessionModeControl
    />
  );

  expect(screen.getByLabelText('Change session mode')).toBeInTheDocument();
  expect(screen.getByLabelText('Queue summary')).toBeInTheDocument();
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

  fireEvent.click(screen.getByRole('button', { name: 'Queue clear' }));
  expect(screen.getByText('Queue clear. Continue Flow.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Queue summary')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('i 3/3')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Continue reading' }));
  expect(onContinueReading).toHaveBeenCalledTimes(1);
});

it('uses topic units for reading-only progress', () => {
  renderToolbar({
    reviewCompletedCount: 2,
    reviewProgressCounts: progressCounts(0, 2, 0, 4),
    reviewQueueCount: 4,
    reviewSessionMode: 'reading-only',
    showSessionModeControl: true
  });

  expect(screen.getByLabelText('t 2/6')).toBeInTheDocument();
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
  expect(screen.queryByLabelText('Queue summary')).not.toBeInTheDocument();
});

it('resumes from the queue with the Read shortcut while keeping Space free', () => {
  const onContinueReading = vi.fn();
  const onResumeReviewItem = vi.fn();
  renderToolbar({
    onContinueReading,
    onResumeReviewItem,
    reviewCurrentNodeId: null,
    reviewQueueCount: 3,
    reviewStatus: 'idle'
  });

  fireEvent.keyDown(window, { code: 'Space', key: ' ' });
  expect(onResumeReviewItem).not.toHaveBeenCalled();

  fireEvent.keyDown(window, { key: 'f' });
  expect(onResumeReviewItem).toHaveBeenCalledTimes(1);
  expect(onContinueReading).not.toHaveBeenCalled();
});

it('keeps an empty dev-restored status bar in idle study mode', () => {
  renderToolbar({
    reviewCurrentNodeId: null,
    reviewQueueCount: 0,
    reviewStatus: 'idle'
  });

  expect(screen.getByText('Flow mode')).toBeInTheDocument();
  expect(screen.queryByText('All clear for now.')).not.toBeInTheDocument();
});
