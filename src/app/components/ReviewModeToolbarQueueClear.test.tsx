import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { ReviewModeToolbar } from './ReviewModeToolbar';

it('shows queue clear controls while continuing reading after review items are done', () => {
  renderWithLocalization(
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
      reviewQueueCount={7}
      reviewSessionMode="recommended"
      reviewSummary={{
        readingElapsedMs: 0,
        readTopicCount: 0,
        reviewElapsedMs: 18 * 60 * 1000,
        reviewedItemCount: 7
      }}
      reviewStatus="awaiting-answer"
      showSessionModeControl
    />
  );

  const queueClearButton = screen.getByRole('button', { name: 'Queue clear' });
  expect(queueClearButton).toBeInTheDocument();
  expect(queueClearButton).toHaveClass('bg-transparent');
  expect(queueClearButton).not.toHaveClass('bg-foreground/[0.055]');
  expect(screen.queryByLabelText('Change session mode')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Queue summary')).toBeInTheDocument();

  expect(screen.getByLabelText('Queue summary')).toBeInTheDocument();

  fireEvent.click(queueClearButton);
  expect(screen.getByText('Queue clear. Flow on.')).toBeInTheDocument();
});
