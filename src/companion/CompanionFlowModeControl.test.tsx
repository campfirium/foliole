import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { CompanionFlowModeContext, CompanionFlowModeMenu } from './CompanionFlowModeControl';
import { ReadingActionsSheet } from './CompanionReadingSheets';

it('shows every Flow mode with its name and selected state in the reading actions menu', () => {
  const onChange = vi.fn();
  const close = vi.fn();
  render(<CompanionFlowModeContext.Provider value={{ mode: 'recommended', onChange, disabled: false, progressCounts: { completedItemCount: 2, queuedItemCount: 18, completedTopicCount: 0, queuedTopicCount: 1 } }}>
    <ReadingActionsSheet open onFindInDocument={vi.fn()} onOpenChange={close} onOpenReadingSheet={vi.fn()} />
  </CompanionFlowModeContext.Provider>);
  expect(screen.getByRole('button', { name: 'Review and reading' })).toHaveAttribute('aria-pressed', 'true');
  const review = screen.getByRole('button', { name: 'Review first' });
  expect(review).toHaveAttribute('aria-pressed', 'false');
  const progress = screen.getByText('Item 2/20 · Topic 0/1', { exact: true });
  const modes = screen.getByRole('group', { name: /mode/i });
  expect(modes).not.toContainElement(progress);
  expect(modes.compareDocumentPosition(progress)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  fireEvent.click(screen.getByRole('button', { name: 'Reading only' }));
  expect(onChange).toHaveBeenCalledWith('reading-only');
  expect(close).toHaveBeenCalledWith(false);
});

it('does not expose Flow modes from ordinary browsing', () => {
  render(<ReadingActionsSheet open onFindInDocument={vi.fn()} onOpenChange={vi.fn()} onOpenReadingSheet={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Reading only' })).not.toBeInTheDocument();
});

it('keeps mode switching available without a current article and respects pending work', () => {
  const onChange = vi.fn();
  render(<CompanionFlowModeMenu controls={{ mode: 'reading-only', onChange, disabled: true }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
  expect(screen.getByRole('button', { name: 'Reading only' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Review first' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Review first' }));
  expect(onChange).not.toHaveBeenCalled();
});

it('shows how long this Flow round spent on review and on reading', () => {
  render(<CompanionFlowModeContext.Provider value={{ mode: 'recommended', onChange: vi.fn(), disabled: false,
    sessionTiming: { reviewedItemCount: 3, reviewElapsedMs: 4 * 60_000, readTopicCount: 1, readingElapsedMs: 75 * 60_000 } }}>
    <ReadingActionsSheet open onFindInDocument={vi.fn()} onOpenChange={vi.fn()} onOpenReadingSheet={vi.fn()} />
  </CompanionFlowModeContext.Provider>);
  const summary = screen.getByRole('group', { name: 'Queue summary' });
  expect(summary).toHaveTextContent('Reviewed3 items4 min');
  expect(summary).toHaveTextContent('Read1 topic1 hr 15 min');
});

it('leaves out timing rows for work this Flow round has not done', () => {
  render(<CompanionFlowModeMenu controls={{ mode: 'recommended', onChange: vi.fn(), disabled: false,
    sessionTiming: { reviewedItemCount: 0, reviewElapsedMs: 0, readTopicCount: 2, readingElapsedMs: 20_000 } }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
  const summary = screen.getByRole('group', { name: 'Queue summary' });
  expect(summary).not.toHaveTextContent('Reviewed');
  expect(summary).toHaveTextContent('Read2 topics1 min');
});

it('hides the timing summary before any Flow work', () => {
  render(<CompanionFlowModeMenu controls={{ mode: 'recommended', onChange: vi.fn(), disabled: false,
    sessionTiming: { reviewedItemCount: 0, reviewElapsedMs: 0, readTopicCount: 0, readingElapsedMs: 0 } }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
  expect(screen.queryByRole('group', { name: 'Queue summary' })).not.toBeInTheDocument();
});
