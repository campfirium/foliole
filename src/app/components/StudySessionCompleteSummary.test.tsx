import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { StudySessionCompleteSummary } from './StudySessionCompleteSummary';

it('shows the completed review phase summary and continues reading', () => {
  renderWithLocalization(
    <StudySessionCompleteSummary
      completedAt="2026-03-10T12:15:00.000Z"
      createdItemCount={12}
      createdTopicCount={2}
      readingElapsedMs={34 * 60 * 1000}
      readTopicCount={2}
      reviewElapsedMs={18 * 60 * 1000}
      reviewedItemCount={4}
      nextReviewDueAt="2026-03-11T09:30:00.000Z"
      reviewSessionMode="recommended"
      sessionStartedAt="2026-03-10T12:00:00.000Z"
    />
  );

  expect(screen.getByText('Queue clear')).toBeInTheDocument();
  expect(screen.getByText('Reviewed')).toBeInTheDocument();
  expect(screen.getByText('4')).toBeInTheDocument();
  expect(screen.getAllByText('items')).toHaveLength(2);
  expect(screen.getByText('18 min')).toBeInTheDocument();
  expect(screen.getByText('Read')).toBeInTheDocument();
  expect(screen.getAllByText('2')).toHaveLength(2);
  expect(screen.getAllByText('topics')).toHaveLength(2);
  expect(screen.getByText('34 min')).toBeInTheDocument();
  expect(screen.getByText('Created')).toBeInTheDocument();
  expect(screen.getByText('12')).toBeInTheDocument();
  expect(screen.getByText('Next review')).toBeInTheDocument();
  expect(screen.getByText(/Mar 11|11 Mar/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Continue reading' })).not.toBeInTheDocument();
});

it('uses review-first completion copy without claiming every reading topic is done', () => {
  renderWithLocalization(
    <StudySessionCompleteSummary
      completedAt="2026-03-10T12:15:00.000Z"
      createdItemCount={0}
      createdTopicCount={0}
      readingElapsedMs={0}
      readTopicCount={0}
      reviewElapsedMs={18 * 60 * 1000}
      reviewedItemCount={4}
      nextReviewDueAt={null}
      reviewSessionMode="review-first"
      sessionStartedAt="2026-03-10T12:00:00.000Z"
    />
  );

  expect(screen.getByText('Review queue clear')).toBeInTheDocument();
  expect(screen.queryByText('Reading complete')).not.toBeInTheDocument();
});

it('uses reading session completion copy without claiming review items are done', () => {
  renderWithLocalization(
    <StudySessionCompleteSummary
      completedAt="2026-03-10T12:15:00.000Z"
      createdItemCount={0}
      createdTopicCount={0}
      readingElapsedMs={34 * 60 * 1000}
      readTopicCount={2}
      reviewElapsedMs={0}
      reviewedItemCount={0}
      nextReviewDueAt="2026-03-11T09:30:00.000Z"
      reviewSessionMode="reading-only"
      sessionStartedAt="2026-03-10T12:00:00.000Z"
    />
  );

  expect(screen.getByText('Reading complete')).toBeInTheDocument();
  expect(screen.queryByText('Review queue clear')).not.toBeInTheDocument();
  expect(screen.queryByText('Next review')).not.toBeInTheDocument();
});
