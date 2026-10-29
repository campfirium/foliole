import { expect, it } from 'vitest';

import { calendarDateKey, monthLeadingDays, reviewCalendarDayKey, reviewCalendarMonths } from './reviewCalendarDates.js';

it('follows the review day boundary and generates twelve calendar months across years', () => {
  expect(reviewCalendarDayKey(new Date(2026, 9, 2, 3, 59), 4)).toBe('2026-10-01');
  expect(reviewCalendarDayKey(new Date(2026, 9, 2, 4), 4)).toBe('2026-10-02');
  const months = reviewCalendarMonths(new Date(2026, 11, 2));
  expect(months.map(calendarDateKey)).toHaveLength(12);
  expect(calendarDateKey(months[0]!)).toBe('2026-07-01');
  expect(calendarDateKey(months[11]!)).toBe('2027-06-01');
  expect(monthLeadingDays(new Date(2026, 5, 1))).toBe(0);
  expect(monthLeadingDays(new Date(2028, 1, 1))).toBe(1);
});
