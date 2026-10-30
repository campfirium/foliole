import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fsrsReviewCard, readingReviewCard, renderShellWithSurface, reviewSurface } from './CompanionShellReviewSurfaceTestSupport';

afterEach(() => { window.localStorage.clear(); });

describe('CompanionShell review surfaces', () => {
  const RELEASE_GATE_TEST_TIMEOUT_MS = 15_000;

  it('shows Queue clear and exits Flow without continuing reading', { meta: { calibratedMs: RELEASE_GATE_TEST_TIMEOUT_MS } }, async () => {
    const surface = reviewSurface(null);
    const refresh = await renderShellWithSurface(surface);

    expect(screen.getByText('Queue clear')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Only Review' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Next Item:/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('companion-bottom-tab-bar')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Exit Flow' }));
    expect(surface.handleTabAction).toHaveBeenCalledWith('recent');
    expect(surface.handleContinueReading).not.toHaveBeenCalled();
    expect(screen.queryByText(/Synced review state/)).not.toBeInTheDocument();
    expect(screen.queryByText('Readable article')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('companion-top-bar-left-action'));
    expect(surface.handleTabAction).toHaveBeenCalledWith('recent');
    surface.activeAction = 'recent';
    refresh();
    expect(screen.getByTestId('companion-bottom-tab-bar')).toBeInTheDocument();
  });

  it.each([false, true])('keeps reading actions available with Queue clear=%s', async queueCleared => {
    const surface = reviewSurface(readingReviewCard);
    surface.flowSummary.queueCleared = queueCleared;
    await renderShellWithSurface(surface);
    expect(screen.queryByText('Queue clear')).not.toBeInTheDocument();

    expect(screen.getByLabelText('Soon')).toBeInTheDocument();
    expect(screen.getByLabelText('Later')).toBeInTheDocument();
    expect(screen.getByLabelText('Read')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Read'));
    expect(surface.handleReadReviewTopic).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Dismiss')).toBeInTheDocument();
    expect(screen.queryByLabelText('Again')).not.toBeInTheDocument();
  });

  it('uses the current Flow Item for content and grading actions', async () => {
    const surface = reviewSurface(fsrsReviewCard);
    surface.flowSummary.queueCleared = true;
    await renderShellWithSurface(surface);
    expect(screen.queryByText('Queue clear')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Good'));
    expect(surface.handleGradeReview).toHaveBeenCalledWith(3);
    expect(screen.getByText('Question prompt')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Companion review toolbar' })).toHaveAttribute('data-review-item-kind', 'fsrs');
    expect(screen.getByLabelText('Again')).toBeInTheDocument();
    expect(screen.queryByLabelText('Read')).not.toBeInTheDocument();
  });

  it('reserves review footer space separately from the normal bottom tabs', async () => {
    await renderShellWithSurface(reviewSurface(readingReviewCard));

    const content = screen.getByTestId('companion-scroll-container').firstElementChild;
    expect(content?.className).toContain('[padding-bottom:8rem]');
    expect(content?.className).not.toContain('[padding-bottom:4.5rem]');
  });
});

it.each([readingReviewCard, fsrsReviewCard])('keeps the page toolbar hidden through the next $itemKind body loading', async card => {
  const loading = { pending: false };
  const surface = reviewSurface(card);
  const advance = card.itemKind === 'fsrs' ? surface.handleGradeReview : surface.handleReadReviewTopic;
  advance.mockImplementation(() => { loading.pending = true; });
  const refresh = await renderShellWithSurface(surface, loading);

  fireEvent.click(screen.getByText(card.content));
  fireEvent.click(screen.getByTestId('companion-reading-edit'));
  expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.getByTestId('companion-reading-edit')).toBeInTheDocument());
  fireEvent.click(screen.getByLabelText(card.itemKind === 'fsrs' ? 'Good' : 'Read'));
  expect(advance).toHaveBeenCalledOnce();
  refresh();
  expect(screen.queryByRole('heading', { name: 'Flow' })).not.toBeInTheDocument();
  expect(screen.queryByTestId('companion-reading-exit')).not.toBeInTheDocument();
  expect(screen.getByText('Loading topic body.')).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: 'Review breadcrumb' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: card.title })).not.toBeInTheDocument();
  expect(screen.getByLabelText(card.itemKind === 'fsrs' ? 'Good' : 'Read')).toBeDisabled();

  loading.pending = false;
  refresh();
  expect(screen.getByText(card.content)).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Flow' })).not.toBeInTheDocument();
});

it.each(['readingError', 'reviewError', 'flowError'] as const)('keeps %s visible under Flow actions', async channel => {
  const surface = reviewSurface(readingReviewCard);
  surface.flowSummary.queueCleared = true;
  surface[channel] = 'Could not save the action.';
  await renderShellWithSurface(surface);
  expect(screen.getByText('Could not save the action.')).toBeInTheDocument();
  expect(screen.queryByText('Queue clear')).not.toBeInTheDocument();
});
