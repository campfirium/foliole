import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../localization/testLocalization';

import { ReadingReviewActions, ReviewGradeActions } from './ReviewActionControls';

afterEach(() => {
  vi.useRealTimers();
});

it('renders companion-friendly grade buttons as a single shared row when requested', () => {
  const submitGrade = vi.fn(async () => undefined);

  renderWithLocalization(
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

  renderWithLocalization(
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
  renderWithLocalization(
    <ReviewGradeActions
      errorMessage={null}
      isSubmitting={false}
      surface="overlay"
      submitGrade={vi.fn(async () => undefined)}
    />
  );

  expect(screen.getByLabelText('Review grade actions').className).toContain('[&_button]:!border-0');
  expect(screen.getByLabelText('Review grade actions').className).toContain('border-0');
  expect(document.querySelectorAll('[data-review-overlay-divider]')).toHaveLength(3);
  expect(document.querySelector('[data-review-overlay-divider]')).toHaveClass('h-4');
  expect(screen.getByRole('button', { name: 'Again' }).className).toContain('rounded-none');
  expect(screen.getByRole('button', { name: 'Again' }).className).toContain('border-0');
  expect(screen.getByRole('button', { name: 'Again' })).toHaveStyle({ border: '0', borderRadius: '0' });
  expect(screen.getByRole('button', { name: 'Again' })).not.toHaveAttribute('data-active');
});

it('adds short overlay dividers between reading review actions only for overlay surface', () => {
  renderWithLocalization(
    <ReadingReviewActions
      onDismissReviewTopic={vi.fn()}
      onPostponeReviewTopic={vi.fn()}
      onReadReviewTopic={vi.fn()}
      onRevisitReviewTopicSoon={vi.fn()}
      surface="overlay"
    />
  );

  expect(screen.getByLabelText('Reading review actions').className).toContain('[&_button]:!border-0');
  expect(screen.getByLabelText('Reading review actions').className).toContain('border-0');
  expect(document.querySelectorAll('[data-review-overlay-divider]')).toHaveLength(3);
  expect(document.querySelector('[data-review-overlay-divider]')).toHaveClass('h-4');
  expect(screen.getByRole('button', { name: 'Soon' }).className).toContain('rounded-none');
  expect(screen.getByRole('button', { name: 'Soon' }).className).toContain('border-0');
  expect(screen.getByRole('button', { name: 'Soon' })).toHaveStyle({ border: '0', borderRadius: '0' });
  expect(screen.getByRole('button', { name: 'Soon' })).not.toHaveAttribute('data-active');
});

it('shows action help cards for reading review actions when enabled', () => {
  vi.useFakeTimers();
  renderWithLocalization(
    <ReadingReviewActions
      onDismissReviewTopic={vi.fn()}
      onPostponeReviewTopic={vi.fn()}
      onReadReviewTopic={vi.fn()}
      onRevisitReviewTopicSoon={vi.fn()}
      showActionHelp
    />
  );

  const later = screen.getByRole('button', { name: 'Later' });
  fireEvent.pointerEnter(later, { pointerType: 'mouse' });

  act(() => {
    vi.advanceTimersByTime(1000);
  });

  expect(screen.getByRole('tooltip')).toHaveTextContent('Later');
  expect(screen.getByRole('tooltip')).toHaveTextContent('Appears again before its regular interval.');
  expect(screen.getByRole('tooltip')).toHaveStyle({ transform: 'translate(-50%, -100%)' });
});

it('shows action help cards for grade actions when enabled', () => {
  vi.useFakeTimers();
  renderWithLocalization(
    <ReviewGradeActions
      errorMessage={null}
      isSubmitting={false}
      showActionHelp
      submitGrade={vi.fn(async () => undefined)}
    />
  );

  const hard = screen.getByRole('button', { name: 'Hard' });
  fireEvent.pointerEnter(hard, { pointerType: 'mouse' });

  act(() => {
    vi.advanceTimersByTime(1000);
  });

  expect(screen.getByRole('tooltip')).toHaveTextContent('Hard');
  expect(screen.getByRole('tooltip')).toHaveTextContent('Show this item again sooner than usual.');
  expect(screen.getByRole('tooltip')).toHaveStyle({ transform: 'translate(-50%, -100%)' });
});
