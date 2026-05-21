import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { StudySessionCompleteSummary } from './StudySessionCompleteSummary';

it('shows the completed review phase summary and continues reading', () => {
  render(
    <StudySessionCompleteSummary
      completedAt="2026-03-10T12:15:00.000Z"
      createdItemCount={12}
      createdTopicCount={2}
      readingElapsedMs={34 * 60 * 1000}
      readTopicCount={2}
      reviewElapsedMs={18 * 60 * 1000}
      reviewedItemCount={4}
      sessionStartedAt="2026-03-10T12:00:00.000Z"
    />
  );

  expect(screen.getByText('Session complete')).toBeInTheDocument();
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
  expect(screen.queryByRole('button', { name: 'Continue reading' })).not.toBeInTheDocument();
});
