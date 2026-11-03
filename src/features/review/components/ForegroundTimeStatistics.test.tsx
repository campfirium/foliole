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
