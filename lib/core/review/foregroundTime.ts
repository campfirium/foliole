import { reviewCalendarDayKey } from './reviewCalendarDates.js';

export interface ForegroundTimeBucket { day: string; durationMs: number }
export interface ForegroundClock { wallMs: number; monotonicMs: number }

export class ForegroundTimeCounter {
  private start: ForegroundClock | null = null;
  private hour = 0;
  private zone = '';
  private offset = 0;
  private totals = new Map<string, number>();

  constructor(private readonly clock: () => ForegroundClock, baseline: readonly ForegroundTimeBucket[] = []) {
    this.totals = new Map(baseline.map((bucket) => [bucket.day, bucket.durationMs]));
  }

  setActive(active: boolean, hour: number) {
    if (this.start && (!active || hour !== this.hour)) this.checkpoint();
    this.hour = hour;
    if (!active) this.start = null;
    else if (!this.start) this.startAt(this.clock());
  }

  checkpoint(): ForegroundTimeBucket[] {
    if (this.start) {
      const now = this.clock();
      for (const part of splitForegroundTime(this.start.wallMs,
        Math.max(0, now.monotonicMs - this.start.monotonicMs), this.hour, this.zone === Intl.DateTimeFormat().resolvedOptions().timeZone ? undefined : this.offset)) {
        this.totals.set(part.day, (this.totals.get(part.day) ?? 0) + part.durationMs);
      }
      this.startAt(now);
    }
    return this.snapshot();
  }

  private startAt(now: ForegroundClock) {
    this.start = now;
    this.zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    this.offset = new Date(now.wallMs).getTimezoneOffset();
  }

  snapshot(): ForegroundTimeBucket[] {
    const values = new Map(this.totals);
    if (this.start) {
      const now = this.clock();
      for (const part of splitForegroundTime(this.start.wallMs,
        Math.max(0, now.monotonicMs - this.start.monotonicMs), this.hour, this.zone === Intl.DateTimeFormat().resolvedOptions().timeZone ? undefined : this.offset)) {
        values.set(part.day, (values.get(part.day) ?? 0) + part.durationMs);
      }
    }
    return [...values].map(([day, durationMs]) => ({ day, durationMs: Math.floor(durationMs) }));
  }
}

export function splitForegroundTime(wallMs: number, durationMs: number, hour: number, previousOffset?: number) {
  if (previousOffset !== undefined) return splitWithFixedOffset(wallMs, durationMs, hour, previousOffset);
  const result: ForegroundTimeBucket[] = [];
  let cursor = wallMs;
  const end = wallMs + durationMs;
  while (cursor < end) {
    const date = new Date(cursor);
    const day = reviewCalendarDayKey(date, hour);
    const [year, month, dayOfMonth] = day.split('-').map(Number);
    // The calendar key shifts elapsed hours from local midnight, including DST changes.
    const boundary = new Date(year!, month! - 1, dayOfMonth! + 1).getTime() + hour * 3_600_000;
    const until = Math.min(end, boundary);
    result.push({ day, durationMs: until - cursor });
    cursor = until;
  }
  return result;
}

function splitWithFixedOffset(wallMs: number, durationMs: number, hour: number, offset: number) {
  const parts: ForegroundTimeBucket[] = [];
  let cursor = wallMs - offset * 60_000;
  const end = cursor + durationMs;
  while (cursor < end) {
    const dayStart = new Date(cursor);
    if (dayStart.getUTCHours() < hour) dayStart.setUTCDate(dayStart.getUTCDate() - 1);
    dayStart.setUTCHours(hour, 0, 0, 0);
    const day = dayStart.toISOString().slice(0, 10);
    dayStart.setUTCDate(dayStart.getUTCDate() + 1);
    const until = Math.min(end, dayStart.getTime());
    parts.push({ day, durationMs: until - cursor });
    cursor = until;
  }
  return parts;
}
