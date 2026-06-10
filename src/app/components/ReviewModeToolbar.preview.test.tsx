import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { ReviewModeToolbar } from './ReviewModeToolbar';

const reviewPreview = {
  Again: { card: { due: '2026-03-10T08:00:00.000Z' } },
  Hard: { card: { due: '2026-03-11T08:00:00.000Z' } },
  Good: { card: { due: '2026-03-12T08:00:00.000Z' } },
  Easy: { card: { due: '2026-03-13T08:00:00.000Z' } }
} as Parameters<typeof ReviewModeToolbar>[0]['reviewPreview'];

it('exposes preview due dates on grade actions after answer reveal', () => {
  renderWithLocalization(
    <ReviewModeToolbar
      isAnswerRevealed
      isCurrentItemGradable
      isCurrentReviewItemVisible
      isReviewEditing={false}
      isStudyMode
      onContinueReading={vi.fn()}
      onDismissReviewTopic={vi.fn(async () => true)}
      onExitReviewMode={vi.fn()}
      onGrade={vi.fn(async () => true)}
      onPostponeReviewTopic={vi.fn(async () => true)}
      onReadReviewTopic={vi.fn(async () => true)}
      onResumeReviewItem={vi.fn()}
      onRevealAnswer={vi.fn()}
      onRevisitReviewTopicSoon={vi.fn(async () => true)}
      onSetReviewSessionMode={vi.fn()}
      reviewCompletedCount={0}
      reviewCurrentNodeId="node-1"
      reviewCurrentTitle={undefined}
      reviewPreview={reviewPreview}
      reviewQueueCount={1}
      reviewSessionMode="recommended"
      reviewStatus="answer-revealed"
    />
  );

  expect(screen.getByRole('button', { name: 'Good' })).toHaveAttribute('title', expect.stringContaining('Next review'));
});
