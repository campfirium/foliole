import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { ReviewQueueEmptyDialog } from './ReviewQueueEmptyDialog';

it('uses the existing all-clear copy when the review queue is empty', () => {
  const onClose = vi.fn();
  renderWithLocalization(<ReviewQueueEmptyDialog content={{ kind: 'empty' }} onClose={onClose} open />);

  expect(screen.getByRole('dialog', { name: 'All clear for now.' })).toBeInTheDocument();
  expect(screen.queryByText('Create or schedule review items, then start Flow again.')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'OK' }));

  expect(onClose).toHaveBeenCalledTimes(1);
});

it('shows Demo day-clear copy in the same dialog shell', () => {
  const onContinueDemoDay = vi.fn();
  const onExitReviewMode = vi.fn();
  renderWithLocalization(
    <ReviewQueueEmptyDialog
      content={{ day: 2, kind: 'demo-day-clear' }}
      onClose={vi.fn()}
      onContinueDemoDay={onContinueDemoDay}
      onExitReviewMode={onExitReviewMode}
      open
    />
  );

  expect(screen.getByRole('dialog', { name: 'Day 2 has no more Flow topics.' })).toBeInTheDocument();
  expect(screen.getByText('Exit Flow, or continue the Demo with Day 3.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Stay Here' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Exit Flow' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue to Day 3' }));

  expect(onExitReviewMode).toHaveBeenCalledTimes(1);
  expect(onContinueDemoDay).toHaveBeenCalledTimes(1);
});
