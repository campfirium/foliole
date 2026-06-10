import { act, fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { ReviewModeToolbar } from './ReviewModeToolbar';

function renderReadingToolbar(overrides: Partial<Parameters<typeof ReviewModeToolbar>[0]> = {}) {
  return renderWithLocalization(
    <ReviewModeToolbar
      isAnswerRevealed={false}
      isCurrentItemGradable={false}
      isCurrentReviewItemVisible
      isReviewEditing={false}
      isStudyMode
      onContinueReading={vi.fn()}
      onDismissReviewTopic={vi.fn(async () => true)}
      onExitReviewMode={vi.fn()}
      onGrade={vi.fn(async () => true)}
      onPostponeReviewTopic={vi.fn(async () => true)}
      onReadReviewTopic={vi.fn(async () => true)}
      onRevealAnswer={vi.fn()}
      onResumeReviewItem={vi.fn()}
      onRevisitReviewTopicSoon={vi.fn(async () => true)}
      onSetReviewSessionMode={vi.fn()}
      reviewCompletedCount={0}
      reviewCurrentNodeId="reading-1"
      reviewCurrentTitle={undefined}
      reviewPreview={null}
      reviewQueueCount={3}
      reviewSessionMode="recommended"
      reviewStatus="awaiting-answer"
      {...overrides}
    />
  );
}

it.each([
  ['Later', 'onPostponeReviewTopic'],
  ['Read', 'onReadReviewTopic'],
  ['Dismiss', 'onDismissReviewTopic']
] as const)('shows retry feedback when %s fails to save', async (label, actionProp) => {
  const action = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  renderReadingToolbar({ [actionProp]: action });

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: label }));
  });

  expect(screen.getByText('Failed to save. Please retry.')).toBeInTheDocument();

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  });

  expect(action).toHaveBeenCalledTimes(2);
});

it('disables reading actions while a save is pending', async () => {
  let completeSave: ((value: boolean) => void) | undefined;
  const onReadReviewTopic = vi.fn(() => new Promise<boolean>((resolve) => {
    completeSave = resolve;
  }));
  renderReadingToolbar({ onReadReviewTopic });

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
  });

  expect(screen.getByRole('button', { name: 'Later' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Read' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Dismiss' })).toBeDisabled();

  await act(async () => {
    completeSave?.(true);
  });

  expect(screen.getByRole('button', { name: 'Read' })).not.toBeDisabled();
});
