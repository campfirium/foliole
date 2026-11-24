import { z } from 'zod';

const timestamp = z.string().datetime({ offset: true });
const calendarDate = z.string().date();
const isoHistory = /^([+-]\d{6}|\d{4})(?:-(\d{2})(?:-(\d{2}))?)?(?:T(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:\d{2}))?$/iu;
const legacyTime = String.raw`(?:[ \t]+(\d{1,2}:\d{1,2}(?::\d{1,2}(?:\.\d+)?)?)[ \t]*(?:(?:GMT|UTC)(?=[+-]))?)?(Z|[+-]\d{2}:\d{2})`;
const numericHistory = new RegExp(String.raw`^(\d{1,6})([-/.])(\d{1,2})\2(\d{1,6})${legacyTime}$`, 'iu');
const namedHistory = new RegExp(String.raw`^(?:[a-z]{3},[ \t]+)?(?:(\d{1,6})[ \t]+([a-z]{3,})|([a-z]{3,})[ \t]+(\d{1,6}),?)[ \t]+(\d{1,6})${legacyTime}$`, 'iu');
const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MINUTE_MS = 60_000;
const MAX_DATE_MS = 8_640_000_000_000_000;

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
  const instant = parseHistoricalReviewInstant(value);
  if (!Number.isFinite(instant)) throw new InvalidReviewTimestampError(opId);
  return instant;
}

export function parseHistoricalReviewInstant(value: string): number {
  if (isReviewTimestamp(value, true)) return Date.parse(value);
  const iso = isoHistory.exec(value);
  if (iso) {
    const [, year, month, day, time, zone] = iso;
    if (year === '-000000' || (!time && (year?.length !== 4 || !day))) return NaN;
    return fromHistoricalParts(Number(year), Number(month ?? 1), Number(day ?? 1), time, zone, true);
  }
  const numeric = numericHistory.exec(value);
  if (numeric) {
    const [, first, , second, third, time, zone] = numeric;
    if (!time && zone?.toUpperCase() !== 'Z') return NaN;
    // The legacy desktop parser used month/day/year when the first number could be a day.
    const initial = Number(first);
    const [year, month, day] = isDay(initial)
      ? [Number(third), initial, Number(second)] : [initial, Number(second), Number(third)];
    return fromHistoricalParts(expandLegacyYear(year), month, day, time, zone);
  }
  const named = namedHistory.exec(value);
  if (!named) return NaN;
  const [, numberFirst, monthSecond, monthFirst, numberSecond, last, time, zone] = named;
  if (!time && zone?.toUpperCase() !== 'Z') return NaN;
  const first = Number(numberFirst ?? numberSecond);
  const [year, day] = isDay(first) ? [Number(last), first] : [first, Number(last)];
  const month = months.indexOf((monthFirst ?? monthSecond ?? '').slice(0, 3).toLowerCase()) + 1;
  return fromHistoricalParts(expandLegacyYear(year), month, day, time, zone);
}

function isDay(day: number) {
  return day >= 1 && day <= 31;
}

function expandLegacyYear(year: number) {
  if (year < 50) return year + 2000;
  if (year < 100) return year + 1900;
  return year;
}

function fromHistoricalParts(year: number, month: number, day: number, time = '00:00', zone = 'Z', iso = false) {
  if (month < 1 || month > 12 || !isDay(day)) return NaN;
  const [hourText, minuteText, secondText = '0'] = time.split(':');
  const [second, fraction = ''] = secondText.split('.');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const seconds = Number(second);
  const ms = Number(fraction.slice(0, 3).padEnd(3, '0'));
  if (hour > 24 || minute > 59 || seconds > 59) return NaN;
  if (hour === 24 && (minute !== 0 || seconds !== 0 || (iso ? /[1-9]/u.test(fraction) : ms !== 0))) return NaN;

  const utc = zone.toUpperCase() === 'Z';
  const offsetHour = utc ? 0 : Number(zone.slice(1, 3));
  const offsetMinute = utc ? 0 : Number(zone.slice(4));
  if ((iso && offsetHour > 23) || offsetMinute > 59) return NaN;
  const offset = (zone.startsWith('-') ? -1 : 1) * (offsetHour * 60 + offsetMinute);
  // Apply the rollover without asking the host parser to read an impossible date.
  const midnight = new Date(0);
  midnight.setUTCFullYear(year, month - 1, day);
  const instant = midnight.getTime() + (hour * 60 + minute - offset) * MINUTE_MS + seconds * 1000 + ms;
  return Math.abs(instant) <= MAX_DATE_MS ? instant : NaN;
}
