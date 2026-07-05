import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { ReviewModeToolbar } from './ReviewModeToolbar';

function renderOverlayResume(overrides: Partial<Parameters<typeof ReviewModeToolbar>[0]> = {}) {
  return renderWithLocalization(
    <ReviewModeToolbar
      isAnswerRevealed={false}
      isCurrentItemGradable={false}
      isCurrentReviewItemVisible={false}
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
      reviewCurrentTitle="Current topic"
      reviewPreview={null}
      reviewQueueCount={3}
      reviewStatus="awaiting-answer"
      reviewSessionMode="recommended"
      surface="overlay"
      {...overrides}
    />
  );
}

it('uses the overlay action button style for paused resume', () => {
  renderOverlayResume();

  const resumeButton = screen.getByRole('button', { name: 'Resume review' });
  expect(resumeButton).toHaveStyle({ border: '0', borderRadius: '0' });
  expect(resumeButton.className).toContain('min-w-20');
  expect(resumeButton.className).toContain('rounded-none');
  expect(resumeButton).toHaveTextContent('Resume');
});

it('uses the overlay action button style when resuming from a reading queue', () => {
  renderOverlayResume({
    reviewCurrentNodeId: null,
    reviewStatus: 'idle'
  });

  const resumeButton = screen.getByRole('button', { name: 'Resume review' });
  expect(resumeButton).toHaveStyle({ border: '0', borderRadius: '0' });
  expect(resumeButton.className).toContain('min-w-20');
  expect(document.querySelectorAll('[data-review-overlay-divider]')).toHaveLength(0);
});

it('uses the overlay action button style for unrevealed FSRS prompts', () => {
  renderOverlayResume({
    isCurrentItemGradable: true,
    isCurrentReviewItemVisible: true,
    reviewStatus: 'awaiting-answer'
  });

  const showAnswerButton = screen.getByRole('button', { name: 'Show Answer' });
  expect(showAnswerButton).toHaveStyle({ border: '0', borderRadius: '0' });
  expect(showAnswerButton.className).toContain('min-w-20');
  expect(showAnswerButton.className).toContain('rounded-none');
  expect(showAnswerButton.className).not.toContain('min-w-32');
});
