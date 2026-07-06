import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { ReviewQueueEmptyDialog, ReviewQueueEmptyNotice } from './ReviewQueueEmptyDialog';

it('uses the existing all-clear copy when the review queue is empty', () => {
  renderWithLocalization(<ReviewQueueEmptyNotice content={{ kind: 'empty' }} onClose={vi.fn()} open />);

  const notice = screen.getByRole('status');
  expect(notice).toBeInTheDocument();
  expect(notice).toHaveClass('left-[calc(var(--workspace-rail-width)+var(--workspace-list-current-width,300px)+var(--workspace-list-splitter-width,1px))]');
  expect(notice).toHaveClass('top-[var(--workspace-top-toolbar-height)]');
  expect(notice).toHaveClass('right-[calc(var(--workspace-right-sidebar-current-width,320px)+var(--workspace-right-sidebar-splitter-width,1px))]');
  const surface = notice.firstElementChild as HTMLElement;
  expect(surface).toHaveClass('min-h-[52px]');
  expect(surface).toHaveClass('w-[min(300px,100%)]');
  expect(surface).toHaveClass('justify-center');
  expect(surface).toHaveClass('text-center');
  expect(surface).toHaveClass('bg-shellless-surface');
  expect(surface.className).not.toContain('bg-[var(--app-floating-surface-bg)]');
  expect(surface.className).not.toContain('shadow-panel');
  expect(Array.from(document.body.querySelectorAll('*')).some((element) => String(element.className).includes('bg-foreground/10'))).toBe(false);
  const title = screen.getByText('All clear for now.');
  expect(title).toHaveClass('text-ui-md');
  expect(title).toHaveClass('font-medium');
  expect(title).toHaveClass('text-shellless-title');
  expect(screen.queryByText('Create or schedule review items, then start Flow again.')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'OK' })).not.toBeInTheDocument();
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

  expect(screen.getByRole('dialog', { name: 'All clear for Day 2.' })).toBeInTheDocument();
  expect(screen.getByText(/Simulated days are designed specifically for this demo/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Stay Here' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Exit Flow' }));
  fireEvent.click(screen.getByRole('button', { name: 'Simulate Day 3' }));

  expect(onExitReviewMode).toHaveBeenCalledTimes(1);
  expect(onContinueDemoDay).toHaveBeenCalledTimes(1);
});
