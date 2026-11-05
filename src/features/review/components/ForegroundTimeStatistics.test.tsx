import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const localization = vi.hoisted(() => ({ locale: 'en' }));

vi.mock('../../../shared/localization/LocalizationProvider', () => ({
  useLocalization: () => ({ locale: localization.locale, t: (key: string) => key })
}));

import { formatForegroundTime } from '../model/formatForegroundTime';

import { ReviewCalendarTable } from './ReviewCalendarTable';

afterEach(cleanup);

it('shows daily foreground time alongside unchanged Item and Topic quantities', () => {
  render(<ReviewCalendarTable months={[new Date(2026, 9, 1)]} today="2026-10-04"
    counts={() => ({ items: 3, topics: 7 })} duration={(day) => day === '2026-10-04' ? 4_800_000 : null} />);
  const today = screen.getByRole('group', { name: /2026-10-04 .*Items: 3 .*Topics: 7 .*80m/ });
  expect(within(today).getByText('3')).toBeVisible();
  expect(within(today).getByText('7')).toBeVisible();
  expect(within(today).getByText('80')).toBeVisible();
  expect(within(screen.getByRole('table')).getByRole('columnheader', { name: /desktop.foregroundTime.title$/ })).toBeVisible();
});

it.each(['en', 'zh-Hans'])('shows only whole minute numbers in calendar cells in %s', (locale) => {
  localization.locale = locale;
  const durations = [null, 0, 1_000, 59_999, 60_000, 119_999, 3_600_000, 86_100_000];
  const values = ['', '', '', '', '1', '1', '60', '1,435'];
  render(<ReviewCalendarTable months={[new Date(2026, 9, 1)]} today="2026-10-04"
    counts={() => ({ items: null, topics: null })}
    duration={(day) => durations[Number(day.slice(-2)) - 1] ?? null} />);
  values.forEach((value, index) => {
    const date = `2026-10-${String(index + 1).padStart(2, '0')}`;
    expect(screen.getByRole('group', { name: new RegExp(`^${date} `) }).textContent).toBe(value);
  });
  localization.locale = 'en';
});

it('formats known zero, sub-minute time and unavailable time separately', () => {
  expect(formatForegroundTime(null, 'en')).toBe('');
  expect(formatForegroundTime(0, 'en')).toBe('0m');
  expect(formatForegroundTime(1_000, 'en')).toBe('<1m');
  expect(formatForegroundTime(60_000, 'en')).toBe('1m');
  expect(formatForegroundTime(3_600_000, 'en')).toBe('60m');
  expect(formatForegroundTime(4_800_000, 'en')).toBe('80m');
  expect(formatForegroundTime(4_800_000, 'zh-Hans')).toBe('80分钟');
});

it('totals only recorded time per month before rounding, leaving Item and Topic totals empty', () => {
  render(<ReviewCalendarTable months={[new Date(2028, 1, 1), new Date(2028, 2, 1)]} today="2028-03-02"
    counts={() => ({ items: 3, topics: 7 })} duration={(day) => ({
      '2028-02-01': 40_000, '2028-02-29': 40_000, '2028-03-01': 120_000,
      '2028-03-02': 60_000, '2028-03-03': 900_000
    } as Record<string, number>)[day] ?? null} />);
  const footer = screen.getByRole('rowheader', { name: 'desktop.foregroundTime.monthTotal' }).closest('tr')!;
  const cells = within(footer).getAllByRole('cell');
  expect(cells.map((cell) => cell.textContent)).toEqual(['1m', '3m']);
  cells.forEach((cell) => {
    const values = within(cell).getByRole('group').children;
    expect(values[0]).toHaveTextContent(/^$/);
    expect(values[1]).toHaveTextContent(/^$/);
  });
});

it('distinguishes known zero time from unavailable and future months', () => {
  render(<ReviewCalendarTable months={[new Date(2026, 8, 1), new Date(2026, 9, 1), new Date(2026, 10, 1)]}
    today="2026-10-02" counts={() => ({ items: null, topics: null })}
    duration={(day) => day === '2026-10-01' ? 0 : null} />);
  const footer = screen.getByRole('rowheader', { name: 'desktop.foregroundTime.monthTotal' }).closest('tr')!;
  expect(within(footer).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['', '0m', '']);
});

it('omits time totals when the table has no time metric', () => {
  render(<ReviewCalendarTable months={[new Date(2026, 9, 1)]} today="2026-10-02"
    counts={() => ({ items: 3, topics: 7 })} />);
  expect(screen.queryByRole('rowheader', { name: 'desktop.foregroundTime.monthTotal' })).not.toBeInTheDocument();
});

it('refreshes monthly totals as history loads, changes and becomes unavailable', () => {
  const props = { months: [new Date(2026, 9, 1)], today: '2026-10-02',
    counts: () => ({ items: 3, topics: 7 }) };
  const { rerender } = render(<ReviewCalendarTable {...props} duration={() => null} />);
  const footer = () => screen.getByRole('rowheader', { name: 'desktop.foregroundTime.monthTotal' }).closest('tr')!;
  expect(within(footer()).getByRole('cell')).toHaveTextContent(/^$/);
  rerender(<ReviewCalendarTable {...props} duration={() => 30_000} />);
  expect(within(footer()).getByRole('cell')).toHaveTextContent(/^1m$/);
  rerender(<ReviewCalendarTable {...props} duration={() => 60_000} />);
  expect(within(footer()).getByRole('cell')).toHaveTextContent(/^2m$/);
  rerender(<ReviewCalendarTable {...props} duration={() => null} />);
  expect(within(footer()).getByRole('cell')).toHaveTextContent(/^$/);
});
