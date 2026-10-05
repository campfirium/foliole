import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../../shared/localization/LocalizationProvider', () => ({
  useLocalization: () => ({ locale: 'en', t: (key: string) => key })
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
  expect(within(today).getByText('80m')).toBeVisible();
  expect(within(screen.getByRole('table')).getByRole('columnheader', { name: /desktop.foregroundTime.title$/ })).toBeVisible();
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
