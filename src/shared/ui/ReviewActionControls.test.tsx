import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { ReadingReviewActions, ReviewGradeActions } from './ReviewActionControls';

it('renders companion-friendly grade buttons as a single shared row when requested', () => {
  const submitGrade = vi.fn(async () => undefined);

  render(
    <ReviewGradeActions
      buttonClassName="min-w-0 flex-1 px-3"
      buttonVariant="primary"
      errorMessage={null}
      groupClassName="w-full gap-2"
      isSubmitting={false}
      submitGrade={submitGrade}
    />
  );

  const group = screen.getByLabelText('Review grade actions');
  expect(group.className).toContain('w-full');
  expect(screen.getByRole('button', { name: 'Again' }).className).toContain('flex-1');
  expect(screen.getByRole('button', { name: 'Again' }).className).toContain('border');
  expect(screen.getByRole('button', { name: 'Easy' }).className).toContain('flex-1');

  fireEvent.click(screen.getByRole('button', { name: 'Good' }));
  expect(submitGrade).toHaveBeenCalledWith(3);
});

it('renders an optional retry action next to grade errors', () => {
  const onRetry = vi.fn();

  render(
    <ReviewGradeActions
      errorMessage="Failed to save grade. Please retry."
      isSubmitting={false}
      onRetry={onRetry}
      submitGrade={vi.fn(async () => undefined)}
    />
  );

  expect(screen.getByText('Failed to save grade. Please retry.')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  expect(onRetry).toHaveBeenCalledTimes(1);
});

it('adds short overlay dividers between grade actions only for overlay surface', () => {
  render(
    <ReviewGradeActions
      errorMessage={null}
      isSubmitting={false}
      surface="overlay"
      submitGrade={vi.fn(async () => undefined)}
    />
  );

  expect(screen.getByLabelText('Review grade actions').className).toContain('[&>*+*]:border-[rgb(var(--color-border)/0.8)]');
    expect(screen.getByRole('button', { name: 'Again' }).className).toContain('border-0');
});

it('adds short overlay dividers between reading review actions only for overlay surface', () => {
  render(
    <ReadingReviewActions
      onDismissReviewTopic={vi.fn()}
      onPostponeReviewTopic={vi.fn()}
      onReadReviewTopic={vi.fn()}
      onRevisitReviewTopicSoon={vi.fn()}
      surface="overlay"
    />
  );

  expect(screen.getByLabelText('Reading review actions').className).toContain('[&>*+*]:border-[rgb(var(--color-border)/0.8)]');
    expect(screen.getByRole('button', { name: 'Soon' }).className).toContain('border-0');
});
