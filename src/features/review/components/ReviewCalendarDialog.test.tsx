import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../../shared/localization/LocalizationProvider', () => ({
  useTranslation: () => (key: string) => key,
  useLocalization: () => ({ locale: 'en', t: (key: string) => key })
}));
vi.mock('./useReviewCalendar', () => ({ useReviewCalendar: () => ({
  months: Array.from({ length: 12 }, (_, index) => new Date(2026, 5 + index, 1)),
  today: '2026-06-01', counts: () => ({ items: 0, topics: null }), failed: false, retry: vi.fn()
}) }));

import { ReviewCalendarDialog } from './ReviewCalendarDialog';
import { ReviewCalendarMonth } from './ReviewCalendarMonth';

afterEach(cleanup);

it('moves the legend past a month starting Monday and opens the initial page again after closing', async () => {
  render(<ReviewCalendarDialog />);
  const trigger = screen.getByRole('button', { name: 'desktop.reviewCalendar.title' });
  fireEvent.click(trigger);
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByRole('region', { name: 'June 2026' })).not.toHaveTextContent('Date');
  expect(within(dialog).getByRole('region', { name: 'July 2026' })).toHaveTextContent('DateItemsTopics');
  fireEvent.click(within(dialog).getByRole('button', { name: 'desktop.reviewCalendar.next' }));
  expect(within(dialog).getByRole('region', { name: 'December 2026' })).toBeVisible();
  fireEvent.keyDown(dialog, { key: 'Escape' });
  fireEvent.click(trigger);
  expect(await screen.findByRole('region', { name: 'June 2026' })).toBeVisible();
});

it('renders leap day, marks today, and explains unavailable history without printing placeholders', () => {
  render(<ReviewCalendarMonth month={new Date(2028, 1, 1)} showYear showLegend today="2028-02-29"
    counts={() => ({ items: 0, topics: null })} />);
  const leapDay = screen.getByRole('group', { name: /2028-02-29 .*Items: 0 .*Topics: desktop.reviewCalendar.unavailable/ });
  expect(leapDay).toHaveTextContent(/^29$/);
  expect(within(leapDay).getByText('29')).toHaveAttribute('aria-current', 'date');
  expect(screen.queryByRole('group', { name: /2028-02-30/ })).not.toBeInTheDocument();
});
