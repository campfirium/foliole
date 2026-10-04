import type { ForegroundTimeHistory, ForegroundTimeHistoryArgs } from '../../platform/nativeForegroundTimeContract.js';
import type { ForegroundTimeBucket } from '../review/foregroundTime.js';
import { reviewCalendarDayKey } from '../review/reviewCalendarDates.js';
import { validateReviewDayKey } from '../review/topicDailyCountIdentity.js';
import type { DbPort } from '../sync/dbPort.js';

export async function readForegroundTimeHistory(db: DbPort, args: ForegroundTimeHistoryArgs, hour: number,
  pending?: { sourceId: string; buckets: ForegroundTimeBucket[] }): Promise<ForegroundTimeHistory> {
  validateReviewDayKey(args.fromDay); validateReviewDayKey(args.toDay);
  const span = new Date(args.toDay).getTime() - new Date(args.fromDay).getTime();
  if (span <= 0 || span > 370 * 86400000) throw new Error('Invalid foreground time range');
  const rows = await db.query<{ day_key: string; duration_ms: number }>(
    `SELECT day_key, SUM(duration_ms) AS duration_ms FROM foreground_daily_time
      WHERE day_key >= ? AND day_key < ? GROUP BY day_key`, [args.fromDay, args.toDay]);
  const days = new Map(rows.map((row) => [row.day_key, row.duration_ms]));
  if (pending) {
    const saved = await db.query<{ day_key: string; duration_ms: number }>(
      'SELECT day_key, duration_ms FROM foreground_daily_time WHERE source_id = ?', [pending.sourceId]);
    const own = new Map(saved.map((row) => [row.day_key, row.duration_ms]));
    for (const bucket of pending.buckets) {
      if (bucket.day < args.fromDay || bucket.day >= args.toDay) continue;
      days.set(bucket.day, (days.get(bucket.day) ?? 0) + Math.max(0, bucket.durationMs - (own.get(bucket.day) ?? 0)));
    }
  }
  const [coverage] = await db.query<{ started_at: string }>('SELECT started_at FROM foreground_time_coverage WHERE id = 1');
  if (!coverage) throw new Error('Foreground time coverage is unavailable');
  const first = await db.query<{ day_key: string }>('SELECT MIN(day_key) AS day_key FROM foreground_daily_time');
  const localStart = reviewCalendarDayKey(new Date(coverage.started_at), hour);
  return { coverageFrom: first[0]?.day_key && first[0].day_key < localStart ? first[0].day_key : localStart,
    days: [...days].map(([day, durationMs]) => ({ day, durationMs })) };
}
