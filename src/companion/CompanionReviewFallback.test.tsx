import { fireEvent, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
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

it('shows the actual Flow results and always offers an exit from the completion surface', () => {
  const exit = vi.fn();
  renderWithLocalization(<CompanionReviewFallback summary={summary} error={null} hasSnapshot hasTopics
    onExit={exit} />);

  expect(screen.getByText('Reviewed')).toBeInTheDocument();
  expect(screen.getByText('12')).toBeInTheDocument();
  expect(screen.getByText('8 min')).toBeInTheDocument();
  expect(screen.getByText('Read')).toBeInTheDocument();
  expect(screen.getByText('2')).toBeInTheDocument();
  expect(screen.getByText('7 min')).toBeInTheDocument();
  const footer = screen.getByRole('contentinfo');
  const actions = within(footer).getByRole('group', { name: 'Companion review toolbar' });
  fireEvent.click(within(actions).getByRole('button', { name: 'Exit Flow' }));
  expect(exit).toHaveBeenCalledOnce();
});

it('reports zero activity honestly when Flow was opened with an already clear queue', () => {
  renderWithLocalization(<CompanionReviewFallback summary={{ ...summary, readTopicCount: 0,
    reviewedItemCount: 0, readingElapsedMs: 0, reviewElapsedMs: 0 }} error={null} hasSnapshot hasTopics
    onExit={vi.fn()} />);

  expect(screen.getAllByText('0')).toHaveLength(2);
  expect(screen.queryByText('Just now')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Exit Flow' })).toBeInTheDocument();
});

it('uses consistent Chinese labels for completed reading and review results', async () => {
  renderWithLocalization(<LocalizationProvider initialLanguagePreference="zh-Hans">
    <CompanionReviewFallback summary={summary} error={null} hasSnapshot hasTopics
      onExit={vi.fn()} />
  </LocalizationProvider>);

  expect(await screen.findByText('已复习')).toBeInTheDocument();
  expect(await screen.findByText('已阅读')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '退出 Flow' })).toBeInTheDocument();
});
