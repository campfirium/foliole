import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { SchedulerPreviewResult } from '../../features/review/model/reviewTypes';

import { ReviewModeToolbar } from './ReviewModeToolbar';

const preview: SchedulerPreviewResult = {
  Again: { card: { due: '2026-01-01T00:01:00.000Z' }, reviewed_at: '2026-01-01T00:00:00.000Z' } as SchedulerPreviewResult['Again'],
  Hard: { card: { due: '2026-01-01T01:00:00.000Z' }, reviewed_at: '2026-01-01T00:00:00.000Z' } as SchedulerPreviewResult['Hard'],
  Good: { card: { due: '2026-01-02T00:00:00.000Z' }, reviewed_at: '2026-01-01T00:00:00.000Z' } as SchedulerPreviewResult['Good'],
  Easy: { card: { due: '2026-02-01T00:00:00.000Z' }, reviewed_at: '2026-01-01T00:00:00.000Z' } as SchedulerPreviewResult['Easy']
};

function renderToolbar(overrides: Partial<Parameters<typeof ReviewModeToolbar>[0]> = {}) {
  return render(
    <ReviewModeToolbar
      isAnswerRevealed={false}
      isCurrentItemGradable={false}
      isReviewEditing={false}
      isStudyMode
      onCompleteReviewItem={vi.fn(() => true)}
      onDeferReviewItem={vi.fn(() => true)}
      onDismissReviewItem={vi.fn(() => true)}
      onExitReviewMode={vi.fn()}
      onGrade={vi.fn(async () => true)}
      onRevealAnswer={vi.fn()}
      reviewCurrentNodeId="node-1"
      reviewPreview={preview}
      reviewQueueVisibility={{
        currentQueueLabel: 'Reading queue',
        fsrsQueueCount: 2,
        readingQueueCount: 1,
        queueMixRatioFsrs: 1,
        queueMixRatioReading: 2
      }}
      {...overrides}
    />
  );
}

it('renders reading actions and queue status inside the shared review action bar', () => {
  renderToolbar();

  expect(document.querySelector('[data-review-item-kind="reading"]')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Later' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Read' })).toBeInTheDocument();
  expect(screen.getByText('Push queue live')).toBeInTheDocument();
});

it('switches to fsrs reveal and grade actions in the shared review action bar', async () => {
  const onRevealAnswer = vi.fn();
  const onGrade = vi.fn(async () => true);
  const { rerender } = renderToolbar({ isCurrentItemGradable: true, onGrade, onRevealAnswer });

  expect(document.querySelector('[data-review-item-kind="fsrs"]')).toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Show Answer' }));
  });
  expect(onRevealAnswer).toHaveBeenCalledTimes(1);

  rerender(
    <ReviewModeToolbar
      isAnswerRevealed
      isCurrentItemGradable
      isReviewEditing={false}
      isStudyMode
      onCompleteReviewItem={vi.fn(() => true)}
      onDeferReviewItem={vi.fn(() => true)}
      onDismissReviewItem={vi.fn(() => true)}
      onExitReviewMode={vi.fn()}
      onGrade={onGrade}
      onRevealAnswer={onRevealAnswer}
      reviewCurrentNodeId="node-1"
      reviewPreview={preview}
      reviewQueueVisibility={null}
    />
  );

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Good' }));
  });
  expect(onGrade).toHaveBeenCalledWith(3);
});
