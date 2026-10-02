import { resolveCurrentDayStart } from './reviewDayBoundary.js';

export function calendarDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function reviewCalendarDayKey(date: Date, hour: number) {
  return calendarDateKey(resolveCurrentDayStart(date, hour));
}

export function reviewCalendarMonths(today: Date) {
  return Array.from({ length: 12 }, (_, index) => new Date(today.getFullYear(), today.getMonth() - 5 + index, 1));
}

export function monthLeadingDays(month: Date) {
  return (month.getDay() + 6) % 7;
}
