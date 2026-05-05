import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { ReviewModeToolbar } from './ReviewModeToolbar';

function renderToolbar(overrides: Partial<Parameters<typeof ReviewModeToolbar>[0]> = {}) {
  return render(
    <ReviewModeToolbar
      isAnswerRevealed={false}
      isCurrentItemGradable={false}
      isReviewEditing={false}
      isStudyMode
      reviewCompletedCount={0}
      onCompleteReviewItem={vi.fn(() => true)}
      onDeferReviewItem={vi.fn(() => true)}
      onDismissReviewItem={vi.fn(() => true)}
      onExitReviewMode={vi.fn()}
      onGrade={vi.fn(async () => true)}
      onRevealAnswer={vi.fn()}
      reviewCurrentNodeId="node-1"
      reviewQueueCount={3}
      {...overrides}
    />
  );
}

it('renders reading actions and queue status inside the shared review action bar', () => {
  renderToolbar();

  expect(document.querySelector('[data-review-item-kind="reading"]')).toBeInTheDocument();
  expect(screen.getByLabelText('Reading review actions')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Later' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Read' })).toBeInTheDocument();
  expect(screen.getByText('3 left · 0 done')).toBeInTheDocument();
});

it('switches to fsrs reveal and grade actions in the shared review action bar', async () => {
  const onRevealAnswer = vi.fn();
  const onGrade = vi.fn(async () => true);
  const { rerender } = renderToolbar({ isCurrentItemGradable: true, onGrade, onRevealAnswer });

  expect(document.querySelector('[data-review-item-kind="fsrs"]')).toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Show Answer' }));
  });
  expect(screen.getByLabelText('FSRS reveal actions')).toBeInTheDocument();
  expect(onRevealAnswer).toHaveBeenCalledTimes(1);

  rerender(
    <ReviewModeToolbar
      isAnswerRevealed
      isCurrentItemGradable
      isReviewEditing={false}
      isStudyMode
      reviewCompletedCount={0}
      onCompleteReviewItem={vi.fn(() => true)}
      onDeferReviewItem={vi.fn(() => true)}
      onDismissReviewItem={vi.fn(() => true)}
      onExitReviewMode={vi.fn()}
      onGrade={onGrade}
      onRevealAnswer={onRevealAnswer}
      reviewCurrentNodeId="node-1"
      reviewQueueCount={1}
    />
  );

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
