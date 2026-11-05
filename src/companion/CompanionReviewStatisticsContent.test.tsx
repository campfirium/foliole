import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ load: vi.fn(), time: vi.fn(), retry: vi.fn() }));
vi.mock('../features/review/components/useForegroundTimeHistory', () => ({
  useForegroundTimeHistory: (...args: unknown[]) => runtime.time(...args) ?? {
    failed: false, totalDurationMs: null, duration: () => null, retry: runtime.retry
  }
}));
vi.mock('../shared/platform/companion/runtime/companionReviewCalendar', () => ({ loadCompanionReviewCalendar: runtime.load }));

import { CompanionReviewStatisticsContent } from './CompanionReviewStatisticsContent';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks(); });
function open(now = new Date(2026, 10, 4, 12)) {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
  return render(<CompanionReviewStatisticsContent libraryScope="library" />);
}
const day = (key: string) => screen.getByRole('group', { name: new RegExp(`^${key} `) });

it('shows the month with a first-empty-cell guide, hidden zeros and independent quantities', async () => {
  runtime.load.mockResolvedValue({ topicCoverageFrom: '2026-11-02', days: [
    { day: '2026-11-02', items: 2, topics: 3 }, { day: '2026-11-04', items: 99, topics: 99 }
  ], scheduledDays: [{ day: '2026-11-04', topics: 2846, items: 19 }] });
  open();
  await waitFor(() => expect(day('2026-11-04')).toHaveTextContent('2,846'));
  expect(screen.getAllByRole('group')).toHaveLength(30);
  expect(day('2026-11-04')).toHaveAttribute('aria-current', 'date');
  expect(within(day('2026-11-04')).getByText('19')).toBeVisible();
  expect(day('2026-11-02')).toHaveAccessibleName(/Topic: 3 · Item: 2/);
  expect(day('2026-11-01')).toHaveTextContent(/^1$/);
  expect(day('2026-11-05')).toHaveTextContent(/^5$/);
  expect(screen.getByText('Date')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Completed' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Due' })).toBeNull();
});

it('navigates across the year and leap month without inventing dates or displacing Monday the first', async () => {
  runtime.load.mockResolvedValue({ topicCoverageFrom: '2026-01-01', days: [], scheduledDays: [] });
  open(new Date(2028, 0, 4, 12));
  await waitFor(() => expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'false'));
  fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
  expect(screen.getByText('December 2027')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
  await waitFor(() => expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'false'));
  expect(day('2028-02-29')).toBeVisible();
  expect(screen.queryByRole('group', { name: /^2028-02-30 / })).toBeNull();
  cleanup(); open(new Date(2027, 1, 4, 12));
  await waitFor(() => expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'false'));
  expect(screen.queryByText('Date')).toBeNull();
  expect(day('2027-02-01')).toBeVisible();
});

it('keeps a failed read distinct from zero and retries through the actual month query', async () => {
  runtime.load.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue({
    topicCoverageFrom: '2026-01-01', days: [], scheduledDays: [{ day: '2026-11-04', topics: 2, items: 7 }]
  });
  open();
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load review history');
  expect(day('2026-11-04')).toHaveTextContent(/^4$/);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(day('2026-11-04')).toHaveAccessibleName(/Topic: 2 · Item: 7/));
  expect(screen.queryByRole('alert')).toBeNull();
});

it('moves to the new review month at the day boundary without reopening', async () => {
  runtime.load.mockResolvedValue({ topicCoverageFrom: '2026-01-01', days: [], scheduledDays: [] });
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 1, 3, 59, 59));
  render(<CompanionReviewStatisticsContent libraryScope="library" />);
  await act(async () => {});
  expect(screen.getByText('October 2026')).toBeVisible();
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(screen.getByText('November 2026')).toBeVisible();
  expect(day('2026-11-01')).toHaveAttribute('aria-current', 'date');
  expect(runtime.load).toHaveBeenLastCalledWith(expect.objectContaining({
    from: new Date(2026, 10, 1, 4).toISOString(), to: new Date(2026, 11, 1, 4).toISOString()
  }));
});


it('combines total and daily foreground time with review counts using the selected review month', async () => {
  runtime.load.mockResolvedValue({ topicCoverageFrom: '2026-01-01', days: [], scheduledDays: [] });
  runtime.time.mockReturnValue({ failed: false, totalDurationMs: 120_000, retry: runtime.retry,
    duration: (key: string) => key === '2026-11-03' ? 70_000 : null });
  open();
  await waitFor(() => expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'false'));
  expect(screen.getByRole('status', { name: 'Total foreground time' })).toHaveTextContent('2m');
  expect(day('2026-11-03')).toHaveAccessibleName(/Foreground time: 1m/);
  expect(within(day('2026-11-03')).getByText('1')).toBeVisible();
  expect(day('2026-11-05')).toHaveTextContent(/^5$/);
  fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
  expect(runtime.time).toHaveBeenLastCalledWith('2026-10-01', '2026-11-01', '2026-11-04');
  fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
  expect(runtime.time).toHaveBeenLastCalledWith('2026-11-01', '2026-12-01', '2026-11-04');
});

it('keeps review counts visible when foreground time fails and offers a retry', async () => {
  runtime.load.mockResolvedValue({ topicCoverageFrom: '2026-01-01', days: [],
    scheduledDays: [{ day: '2026-11-04', topics: 2, items: 7 }] });
  runtime.time.mockReturnValue({ failed: true, totalDurationMs: null, duration: () => null, retry: runtime.retry });
  open();
  await waitFor(() => expect(day('2026-11-04')).toHaveAccessibleName(/Topic: 2 · Item: 7/));
  expect(screen.getByRole('alert')).toHaveTextContent('Could not load usage time');
  expect(screen.queryByRole('status')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(runtime.retry).toHaveBeenCalledOnce();
});
