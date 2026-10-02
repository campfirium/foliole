import type { NativeReviewCalendarHistory, NativeReviewCalendarHistoryArgs } from '../../platform/nativeReviewCalendarContract.js';
import { reviewCalendarDayKey } from '../review/reviewCalendarDates.js';

import type { DatabaseDriver } from './driver.js';

export function readReviewCalendarHistory(driver: DatabaseDriver, args: NativeReviewCalendarHistoryArgs,
  newDayStartsAtHour: number): NativeReviewCalendarHistory {
  const from = new Date(args.from);
  const to = new Date(args.to);
  const duration = to.getTime() - from.getTime();
  if (!Number.isFinite(duration) || duration <= 0 || duration > 370 * 86400000) {
    throw new Error('Invalid calendar range');
  }
  const items = new Map<string, Set<string>>();
  for (const row of driver.queryAll<{ node_id: string; reviewed_at: string }>(
    `SELECT r.node_id, r.reviewed_at FROM review_log r JOIN nodes n ON n.id = r.node_id
      WHERE julianday(r.reviewed_at) >= julianday(?) AND julianday(r.reviewed_at) < julianday(?) AND n.kind = 'item'`, [args.from, args.to]
  )) {
    const day = reviewCalendarDayKey(new Date(row.reviewed_at), newDayStartsAtHour);
    const ids = items.get(day) ?? new Set<string>();
    ids.add(row.node_id); items.set(day, ids);
  }
  const topics = new Map(driver.queryAll<{ day_key: string; count: number }>(
    'SELECT day_key, count FROM topic_daily_counts WHERE day_key >= ? AND day_key < ?',
    [reviewCalendarDayKey(from, newDayStartsAtHour), reviewCalendarDayKey(to, newDayStartsAtHour)]
  ).map((row) => [row.day_key, row.count]));
  const coverage = driver.queryOne<{ started_at: string }>('SELECT started_at FROM topic_daily_count_coverage WHERE id = 1');
  if (!coverage) throw new Error('Calendar coverage is unavailable');
  const topicCoverageFrom = reviewCalendarDayKey(new Date(coverage.started_at), newDayStartsAtHour);
  return {
    topicCoverageFrom,
    days: [...new Set([...items.keys(), ...topics.keys()])].sort().map((day) => ({
      day, items: items.get(day)?.size ?? 0,
      topics: topics.get(day) ?? (day < topicCoverageFrom ? null : 0)
    }))
  };
}
