import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { ReviewModeToolbar } from './ReviewModeToolbar';

const noticeMocks = vi.hoisted(() => ({ showAppRuntimeNotice: vi.fn() }));

vi.mock('../../shared/ui/AppRuntimeNotice', () => noticeMocks);

function renderToolbar(overrides: Partial<Parameters<typeof ReviewModeToolbar>[0]> = {}) {
  return renderWithLocalization(
    <ReviewModeToolbar
      isAnswerRevealed={false}
      isCurrentItemGradable={false}
      isCurrentReviewItemVisible
      isReviewEditing={false}
      isStudyMode
      onReadReviewTopic={vi.fn(async () => true)}
      onContinueReading={vi.fn()}
      onPostponeReviewTopic={vi.fn(async () => true)}
      onDismissReviewTopic={vi.fn(async () => true)}
      onExitReviewMode={vi.fn()}
      onGrade={vi.fn(async () => true)}
      onRevealAnswer={vi.fn()}
      onResumeReviewItem={vi.fn()}
      onSetReviewSessionMode={vi.fn()}
      onRevisitReviewTopicSoon={vi.fn(async () => true)}
      reviewCompletedCount={7}
      reviewCurrentNodeId="reading-topic"
      reviewCurrentTitle={undefined}
      reviewProgressCounts={{
        completedItemCount: 7,
        completedTopicCount: 0,
        queuedItemCount: 0,
        queuedTopicCount: 7
      }}
      reviewPreview={null}
      reviewQueueCount={7}
      reviewSessionMode="recommended"
      reviewSessionModeAvailability={{ recommended: true, 'review-first': false, 'reading-only': true }}
      reviewSummary={{
        readingElapsedMs: 0,
        readTopicCount: 0,
        reviewElapsedMs: 18 * 60 * 1000,
        reviewedItemCount: 7
      }}
      reviewStatus="awaiting-answer"
      showSessionModeControl
      {...overrides}
    />
  );
}

it('keeps an unavailable review mode from replacing the active reading session', () => {
  const onSetReviewSessionMode = vi.fn();
  renderToolbar({ onSetReviewSessionMode });

  const queueClearButton = screen.getByRole('button', { name: 'Queue clear' });
  expect(queueClearButton).toBeInTheDocument();
  expect(screen.getByLabelText('Change session mode')).toBeInTheDocument();
  expect(screen.queryByLabelText('Queue summary')).not.toBeInTheDocument();

  fireEvent.click(screen.getByLabelText('Change session mode'));
  const reviewFirst = screen.getByRole('menuitem', { name: 'Review first' });
  expect(reviewFirst).toHaveAttribute('data-unavailable', 'true');
  expect(screen.getByText('Review first')).toHaveClass('text-foreground/32');
  fireEvent.click(reviewFirst);
  expect(onSetReviewSessionMode).not.toHaveBeenCalled();
  expect(noticeMocks.showAppRuntimeNotice).toHaveBeenCalledWith('Nothing is available to review in Flow.');

  expect(queueClearButton.closest('.grid')?.firstElementChild).toContainElement(screen.getByLabelText('Change session mode'));
});

it('still changes to an available reading mode', () => {
  const onSetReviewSessionMode = vi.fn();
  renderToolbar({ onSetReviewSessionMode });

  fireEvent.click(screen.getByLabelText('Change session mode'));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Reading only' }));

  expect(onSetReviewSessionMode).toHaveBeenCalledWith('reading-only');
});

it('keeps queue-clear copy after the current queue is empty', () => {
  renderToolbar({
    reviewProgressCounts: {
      completedItemCount: 7,
      completedTopicCount: 3,
      queuedItemCount: 0,
      queuedTopicCount: 0
    },
    reviewQueueCount: 0,
    reviewSummary: {
      readingElapsedMs: 4 * 60 * 1000,
      readTopicCount: 3,
      reviewElapsedMs: 18 * 60 * 1000,
      reviewedItemCount: 7
    }
  });

  const queueClearButton = screen.getByRole('button', { name: 'Queue clear' });
  expect(queueClearButton).toBeInTheDocument();
});
