import type { ForegroundTimeHistory, ForegroundTimeHistoryArgs } from '../../platform/nativeForegroundTimeContract.js';
import type { ForegroundTimeBucket } from '../review/foregroundTime.js';
import { reviewCalendarDayKey } from '../review/reviewCalendarDates.js';
import { validateReviewDayKey } from '../review/topicDailyCountIdentity.js';
import type { DbPort } from '../sync/dbPort.js';

export async function readForegroundTimeHistory(db: DbPort, args: ForegroundTimeHistoryArgs, hour: number,
  pending?: { sourceId: string; buckets: ForegroundTimeBucket[]; unassigned?: boolean }): Promise<ForegroundTimeHistory> {
  validateReviewDayKey(args.fromDay); validateReviewDayKey(args.toDay);
  const span = new Date(args.toDay).getTime() - new Date(args.fromDay).getTime();
  if (span <= 0 || span > 370 * 86400000) throw new Error('Invalid foreground time range');
  const rows = await db.query<{ day_key: string; duration_ms: number; own_duration_ms: number }>(
    `SELECT day_key, SUM(duration_ms) AS duration_ms,
      SUM(CASE WHEN source_id = ? THEN duration_ms ELSE 0 END) AS own_duration_ms
      FROM foreground_daily_time GROUP BY day_key`, [pending?.sourceId ?? '']);
  let totalDurationMs = rows.reduce((total, row) => total + row.duration_ms, 0);
  const days = new Map(rows.filter((row) => row.day_key >= args.fromDay && row.day_key < args.toDay)
    .map((row) => [row.day_key, row.duration_ms]));
  if (pending) {
    const own = new Map(rows.map((row) => [row.day_key, pending.unassigned ? 0 : row.own_duration_ms]));
    for (const bucket of pending.buckets) {
      const excess = Math.max(0, bucket.durationMs - (own.get(bucket.day) ?? 0));
      totalDurationMs += excess;
      if (bucket.day < args.fromDay || bucket.day >= args.toDay) continue;
      days.set(bucket.day, (days.get(bucket.day) ?? 0) + excess);
    }
  }
  const [coverage] = await db.query<{ started_at: string }>('SELECT started_at FROM foreground_time_coverage WHERE id = 1');
  if (!coverage) throw new Error('Foreground time coverage is unavailable');
  const first = await db.query<{ day_key: string }>('SELECT MIN(day_key) AS day_key FROM foreground_daily_time');
  const localStart = reviewCalendarDayKey(new Date(coverage.started_at), hour);
  return { coverageFrom: first[0]?.day_key && first[0].day_key < localStart ? first[0].day_key : localStart,
    totalDurationMs,
    days: [...days].map(([day, durationMs]) => ({ day, durationMs })) };
}
