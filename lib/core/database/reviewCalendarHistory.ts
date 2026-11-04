import type { NativeReviewCalendarHistory, NativeReviewCalendarHistoryArgs } from '../../platform/nativeReviewCalendarContract.js';
import { reviewCalendarDayKey } from '../review/reviewCalendarDates.js';
import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseDriver } from './driver.js';
import { EFFECTIVE_REVIEW_PREDICATE } from './reviewLogRecord.js';

type ItemRow = { node_id: string; reviewed_at: string };
type TopicRow = { day_key: string; count: number };
const ITEMS_SQL = `SELECT r.node_id, r.reviewed_at FROM review_log r JOIN nodes n ON n.id = r.node_id
  WHERE julianday(r.reviewed_at) >= julianday(?) AND julianday(r.reviewed_at) < julianday(?)
    AND n.kind = 'item' AND ${EFFECTIVE_REVIEW_PREDICATE}`;
const TOPICS_SQL = 'SELECT day_key, count FROM topic_daily_counts WHERE day_key >= ? AND day_key < ?';
const COVERAGE_SQL = 'SELECT started_at FROM topic_daily_count_coverage WHERE id = 1';

function topicRange(args: NativeReviewCalendarHistoryArgs, hour: number) {
  const from = new Date(args.from);
  const to = new Date(args.to);
  const duration = to.getTime() - from.getTime();
  if (!Number.isFinite(duration) || duration <= 0 || duration > 370 * 86400000) throw new Error('Invalid calendar range');
  return [reviewCalendarDayKey(from, hour), reviewCalendarDayKey(to, hour)];
}

function projectHistory(itemRows: ItemRow[], topicRows: TopicRow[], startedAt: string | undefined,
  hour: number): NativeReviewCalendarHistory {
  if (!startedAt) throw new Error('Calendar coverage is unavailable');
  const items = new Map<string, Set<string>>();
  for (const row of itemRows) {
    const day = reviewCalendarDayKey(new Date(row.reviewed_at), hour);
    const ids = items.get(day) ?? new Set<string>();
    ids.add(row.node_id); items.set(day, ids);
  }
  const topics = new Map(topicRows.map(row => [row.day_key, row.count]));
  const topicCoverageFrom = reviewCalendarDayKey(new Date(startedAt), hour);
  return {
    topicCoverageFrom,
    days: [...new Set([...items.keys(), ...topics.keys()])].sort().map(day => ({
      day, items: items.get(day)?.size ?? 0,
      topics: topics.get(day) ?? (day < topicCoverageFrom ? null : 0)
    }))
  };
}

export function readReviewCalendarHistory(driver: DatabaseDriver, args: NativeReviewCalendarHistoryArgs,
  hour: number): NativeReviewCalendarHistory {
  const range = topicRange(args, hour);
  return projectHistory(driver.queryAll<ItemRow>(ITEMS_SQL, [args.from, args.to]),
    driver.queryAll<TopicRow>(TOPICS_SQL, range),
    driver.queryOne<{ started_at: string }>(COVERAGE_SQL)?.started_at, hour);
}

export async function readReviewCalendarHistoryWithDb(db: DbPort, args: NativeReviewCalendarHistoryArgs, hour: number) {
  const range = topicRange(args, hour);
  const items = await db.query<ItemRow>(ITEMS_SQL, [args.from, args.to]);
  const topics = await db.query<TopicRow>(TOPICS_SQL, range);
  const [coverage] = await db.query<{ started_at: string }>(COVERAGE_SQL);
  return projectHistory(items, topics, coverage?.started_at, hour);
}
