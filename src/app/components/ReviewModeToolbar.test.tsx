import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { ReviewModeToolbar } from './ReviewModeToolbar';

const baseProps = {
  isStudyMode: true,
  isAnswerRevealed: true,
  isReviewEditing: false,
  reviewCurrentNodeId: 'node-1',
  reviewPreview: null,
  onGrade: vi.fn(async () => true),
  onRevealAnswer: vi.fn(),
  onExitReviewMode: vi.fn()
} as const;

it('shows interval labels when preview payload is available', () => {
  render(
    <ReviewModeToolbar
      {...baseProps}
      reviewPreview={{
        Again: {
          reviewed_at: '2026-03-06T00:00:00.000Z',
          card: { due: '2026-03-06T00:00:00.000Z', last_review: null, state: 0, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, reps: 0, lapses: 0 }
        },
        Hard: {
          reviewed_at: '2026-03-06T00:00:00.000Z',
          card: { due: '2026-03-07T00:00:00.000Z', last_review: null, state: 0, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 1, reps: 0, lapses: 0 }
        },
        Good: {
          reviewed_at: '2026-03-06T00:00:00.000Z',
          card: { due: '2026-03-09T00:00:00.000Z', last_review: null, state: 0, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 3, reps: 0, lapses: 0 }
        },
        Easy: {
          reviewed_at: '2026-03-06T00:00:00.000Z',
          card: { due: '2026-03-13T00:00:00.000Z', last_review: null, state: 0, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 7, reps: 0, lapses: 0 }
        }
      }}
    />
  );

  expect(screen.getByText('Now')).toBeInTheDocument();
  expect(screen.getByText('1d')).toBeInTheDocument();
  expect(screen.getByText('3d')).toBeInTheDocument();
  expect(screen.getByText('7d')).toBeInTheDocument();
});

it('keeps grading actions available when preview is missing', async () => {
  const onGrade = vi.fn();
  render(<ReviewModeToolbar {...baseProps} onGrade={async (grade) => (onGrade(grade), true)} reviewPreview={null} />);

  fireEvent.click(screen.getByRole('button', { name: 'Good' }));
  await waitFor(() => {
    expect(onGrade).toHaveBeenCalledWith(3);
  });
  expect(onGrade).toHaveBeenCalledWith(3);
  expect(screen.queryByText('Now')).not.toBeInTheDocument();
  expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  expect(screen.queryByText('Save failed. Retry.')).not.toBeInTheDocument();
});

it('keeps grading retryable when grading write fails', async () => {
  const onGrade = vi.fn(async () => false);
  render(<ReviewModeToolbar {...baseProps} onGrade={onGrade} reviewPreview={null} />);

  fireEvent.click(screen.getByRole('button', { name: 'Good' }));

  await waitFor(() => {
    expect(onGrade).toHaveBeenCalledWith(3);
  });
  expect(screen.queryByText('Save failed. Retry.')).not.toBeInTheDocument();
  expect(screen.queryByText('Saved')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Good' }));
  await waitFor(() => {
    expect(onGrade).toHaveBeenCalledTimes(2);
  });
});

it('submits Easy grading without showing feedback text', async () => {
  const onGrade = vi.fn(async () => true);
  render(<ReviewModeToolbar {...baseProps} onGrade={onGrade} reviewPreview={null} />);

  fireEvent.click(screen.getByRole('button', { name: 'Easy' }));

  await waitFor(() => {
    expect(onGrade).toHaveBeenCalledWith(4);
  });
  expect(screen.queryByText('Saved')).not.toBeInTheDocument();
});
