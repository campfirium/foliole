import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../../shared/localization/LocalizationProvider', () => ({
  useTranslation: () => (key: string) => key,
  useLocalization: () => ({ locale: 'en', t: (key: string) => key })
}));
vi.mock('./useReviewCalendar', () => ({ useReviewCalendar: () => ({
  months: Array.from({ length: 12 }, (_, index) => new Date(2026, 5 + index, 1)),
  today: '2026-06-01', counts: () => ({ items: 0, topics: null }), failed: false, retry: vi.fn()
}) }));
vi.mock('./useForegroundTimeHistory', () => ({ useForegroundTimeHistory: () => ({
  totalDurationMs: 120_000, duration: () => 60_000, failed: false, retry: vi.fn()
}) }));

import { runAppCommand } from '../../../app/hooks/appCommands';
import { ReviewShortcutHarness } from '../../../app/hooks/useReviewKeyboardShortcuts.testUtils';
import { APP_COMMAND_IDS } from '../../../shared/commands/ids';

import { ReviewCalendarDialog } from './ReviewCalendarDialog';
import { ReviewCalendarTable } from './ReviewCalendarTable';

afterEach(cleanup);

it('opens all twelve months together with both quantity columns and zero-padded dates', async () => {
  render(<ReviewCalendarDialog />);
  act(() => runAppCommand(APP_COMMAND_IDS.openReviewCalendar, {} as never));
  const table = within(await screen.findByRole('dialog')).getByRole('table');
  expect(screen.getByRole('status', { name: 'desktop.foregroundTime.total' })).toHaveTextContent('2m');
  expect(within(table).getByRole('columnheader', { name: 'June' })).toBeVisible();
  expect(within(table).getByRole('columnheader', { name: 'May' })).toBeVisible();
  expect(within(table).getAllByRole('columnheader', { name: /Items$/ })).toHaveLength(12);
  expect(within(table).getAllByRole('columnheader', { name: /Topics$/ })).toHaveLength(12);
  expect(within(table).getByRole('rowheader', { name: '01' })).toBeVisible();
  expect(within(table).getByRole('rowheader', { name: '31' })).toBeVisible();
});

it('includes leap day and leaves unavailable and zero quantities blank without inventing invalid dates', () => {
  const counts = vi.fn(() => ({ items: 0, topics: null }));
  render(<ReviewCalendarTable months={[new Date(2028, 1, 1)]} today="2028-02-29" counts={counts} />);
  const leapDay = screen.getByRole('group', { name: /2028-02-29 .*Items: 0 .*Topics: desktop.reviewCalendar.unavailable/ });
  expect(leapDay).toHaveTextContent(/^$/);
  expect(leapDay).toHaveAttribute('aria-current', 'date');
  expect(screen.queryByRole('group', { name: /2028-03-0[12]/ })).not.toBeInTheDocument();
  expect(counts).toHaveBeenCalledTimes(29);
});

it('keeps four-digit Topic quantities alongside the independent Item quantities', () => {
  render(<ReviewCalendarTable months={[new Date(2026, 9, 1)]} today="2026-10-02"
    counts={() => ({ items: 19, topics: 2846 })} />);
  const today = screen.getByRole('group', { name: /2026-10-02 .*Items: 19 .*Topics: 2846/ });
  expect(within(today).getByText('19')).toBeVisible();
  expect(within(today).getByText('2846')).toBeVisible();
});

it('does not review the underlying Topic and can reopen the full table after closing', async () => {
  const readReviewTopic = vi.fn(async () => true);
  render(<><ReviewShortcutHarness readReviewTopic={readReviewTopic} /><ReviewCalendarDialog /></>);
  act(() => runAppCommand(APP_COMMAND_IDS.openReviewCalendar, {} as never));
  const dialog = await screen.findByRole('dialog');
  fireEvent.keyDown(dialog, { key: 'r' });
  expect(readReviewTopic).not.toHaveBeenCalled();
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  act(() => runAppCommand(APP_COMMAND_IDS.openReviewCalendar, {} as never));
  expect(within(await screen.findByRole('dialog')).getByRole('table')).toBeVisible();
});
