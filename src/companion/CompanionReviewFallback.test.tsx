import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionReviewFallback } from './CompanionReviewFallback';

const summary = {
  completedAt: '2026-10-25T02:15:00.000Z',
  sessionStartedAt: '2026-10-25T02:00:00.000Z',
  readTopicCount: 2,
  readingElapsedMs: 7 * 60_000,
  reviewedItemCount: 12,
  reviewElapsedMs: 8 * 60_000
};

it('shows the actual Flow results and continues reading from the completion surface', () => {
  const continueReading = vi.fn();
  renderWithLocalization(<CompanionReviewFallback summary={summary} error={null} hasSnapshot hasTopics
    canContinueReading onContinueReading={continueReading} />);

  expect(screen.getByText('Reviewed')).toBeInTheDocument();
  expect(screen.getByText('12')).toBeInTheDocument();
  expect(screen.getByText('8 min')).toBeInTheDocument();
  expect(screen.getByText('Read')).toBeInTheDocument();
  expect(screen.getByText('2')).toBeInTheDocument();
  expect(screen.getByText('7 min')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Continue reading' }));
  expect(continueReading).toHaveBeenCalledOnce();
});

it('reports zero activity honestly when Flow was opened with an already clear queue', () => {
  renderWithLocalization(<CompanionReviewFallback summary={{ ...summary, readTopicCount: 0,
    reviewedItemCount: 0, readingElapsedMs: 0, reviewElapsedMs: 0 }} error={null} hasSnapshot hasTopics
    canContinueReading={false} onContinueReading={vi.fn()} />);

  expect(screen.getAllByText('0')).toHaveLength(2);
  expect(screen.queryByText('Just now')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Continue reading' })).not.toBeInTheDocument();
});
