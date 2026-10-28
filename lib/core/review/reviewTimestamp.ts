import { z } from 'zod';

const timestamp = z.string().datetime({ offset: true });
const calendarDate = z.string().date();

export function isReviewTimestamp(value: unknown, allowDateOnly = false): value is string {
  if (typeof value !== 'string') return false;
  const text = value.toUpperCase();
  return (timestamp.safeParse(text).success || (allowDateOnly && calendarDate.safeParse(text).success))
    && Number.isFinite(Date.parse(value));
}
