import { z } from 'zod';

const timestamp = z.string().datetime({ offset: true });
const calendarDate = z.string().date();
const legacyTimestamp = /^(\d{4}-(?:0[1-9]|1[0-2]))-(0[1-9]|[12]\d|3[01])(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})))?$/iu;
const DAY_MS = 86_400_000;

export class InvalidReviewTimestampError extends Error {
  constructor(readonly opId: string | undefined) {
    super('invalid_review_timestamp');
  }
}

export function isReviewTimestamp(value: unknown, allowDateOnly = false): value is string {
  if (typeof value !== 'string') return false;
  const text = value.toUpperCase();
  return (timestamp.safeParse(text).success || (allowDateOnly && calendarDate.safeParse(text).success))
    && Number.isFinite(Date.parse(value));
}

export function requireReviewInstant(value: string, opId?: string): number {
  if (!isReviewTimestamp(value, true)) throw new InvalidReviewTimestampError(opId);
  return Date.parse(value);
}

export function historicalReviewInstant(value: string, opId: string): number {
  if (isReviewTimestamp(value, true)) return Date.parse(value);
  const match = legacyTimestamp.exec(value);
  if (match) {
    const [, month, day, time] = match;
    // The old desktop parser carried overflowing days into the next month. Parse
    // a valid first day so JavaScriptCore and V8 agree even on the original overflow.
    const firstDay = Date.parse(time ? `${month}-01T${time.toUpperCase()}` : `${month}-01`);
    if (Number.isFinite(firstDay)) return firstDay + (Number(day) - 1) * DAY_MS;
  }
  throw new InvalidReviewTimestampError(opId);
}
