import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { StudySessionCompleteSummary } from './StudySessionCompleteSummary';

it('shows the completed review phase summary and continues reading', () => {
  const onContinueReading = vi.fn();

  render(
    <StudySessionCompleteSummary
      completedAt="2026-03-10T12:15:00.000Z"
      onContinueReading={onContinueReading}
      readTopicCount={2}
      reviewedItemCount={4}
      sessionStartedAt="2026-03-10T12:00:00.000Z"
    />
  );

  expect(screen.getByText('Review complete')).toBeInTheDocument();
  expect(screen.getByText('4')).toBeInTheDocument();
  expect(screen.getByText('Reviewed Items')).toBeInTheDocument();
  expect(screen.getByText('2')).toBeInTheDocument();
  expect(screen.getByText('Read Topics')).toBeInTheDocument();
  expect(screen.getByText('15 min')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Continue reading' }));
  expect(onContinueReading).toHaveBeenCalledTimes(1);
});
