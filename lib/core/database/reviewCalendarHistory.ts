import type { NativeReviewCalendarHistory, NativeReviewCalendarHistoryArgs } from '../../platform/nativeReviewCalendarContract.js';
import { reviewCalendarDayKey } from '../review/reviewCalendarDates.js';
import { parseHistoricalReviewInstant } from '../review/reviewTimestamp.js';
import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseDriver } from './driver.js';
import { legacyReviewCalendarDateSql } from './reviewCalendarLegacyIndex.js';
import { EFFECTIVE_REVIEW_PREDICATE } from './reviewLogRecord.js';

type ItemRow = { node_id: string; reviewed_at: string };
type TopicRow = { day_key: string; count: number };
const LEGACY_DATE = legacyReviewCalendarDateSql('r.reviewed_at');
const ITEM_REVIEW_SQL = `SELECT r.node_id, r.reviewed_at FROM review_log r JOIN nodes n ON n.id = r.node_id
  WHERE n.kind = 'item' AND ${EFFECTIVE_REVIEW_PREDICATE}`;
const ITEMS_SQL = `${ITEM_REVIEW_SQL} AND r.reviewed_at >= ? AND r.reviewed_at < ? AND NOT ${LEGACY_DATE}
  UNION ALL ${ITEM_REVIEW_SQL} AND ${LEGACY_DATE}`;
const TOPICS_SQL = 'SELECT day_key, count FROM topic_daily_counts WHERE day_key >= ? AND day_key < ?';
const COVERAGE_SQL = 'SELECT started_at FROM topic_daily_count_coverage WHERE id = 1';

const DAY_MS = 86_400_000;

function historyRanges(args: NativeReviewCalendarHistoryArgs, hour: number) {
  const from = new Date(args.from);
  const to = new Date(args.to);
  const duration = to.getTime() - from.getTime();
  if (!Number.isFinite(duration) || duration <= 0 || duration > 370 * DAY_MS) throw new Error('Invalid calendar range');
  // Offset timestamps and ISO midnight may cross UTC date boundaries.
  const dateBefore = isoDateBound(from.getTime() - 2 * DAY_MS);
  const dateAfter = isoDateBound(to.getTime() + 2 * DAY_MS);
  return {
    items: [dateBefore, dateAfter],
    topics: [reviewCalendarDayKey(from, hour), reviewCalendarDayKey(to, hour)]
  };
}

function isoDateBound(instant: number) {
  if (instant < Date.parse('0000-01-01T00:00:00Z')) return '0000';
  if (instant >= Date.UTC(10_000, 0, 1)) return ':';
  return new Date(instant).toISOString().slice(0, 10);
}

function projectHistory(itemRows: ItemRow[], topicRows: TopicRow[], startedAt: string | undefined,
  hour: number, args: NativeReviewCalendarHistoryArgs): NativeReviewCalendarHistory {
  if (!startedAt) throw new Error('Calendar coverage is unavailable');
  const items = new Map<string, Set<string>>();
  const from = Date.parse(args.from);
  const to = Date.parse(args.to);
  for (const row of itemRows) {
    const instant = parseHistoricalReviewInstant(row.reviewed_at);
    if (!(instant >= from && instant < to)) continue;
    const day = reviewCalendarDayKey(new Date(instant), hour);
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
  const ranges = historyRanges(args, hour);
  return projectHistory(driver.queryAll<ItemRow>(ITEMS_SQL, ranges.items),
    driver.queryAll<TopicRow>(TOPICS_SQL, ranges.topics),
    driver.queryOne<{ started_at: string }>(COVERAGE_SQL)?.started_at, hour, args);
}

export async function readReviewCalendarHistoryWithDb(db: DbPort, args: NativeReviewCalendarHistoryArgs, hour: number) {
  const ranges = historyRanges(args, hour);
  const items = await db.query<ItemRow>(ITEMS_SQL, ranges.items);
  const topics = await db.query<TopicRow>(TOPICS_SQL, ranges.topics);
  const [coverage] = await db.query<{ started_at: string }>(COVERAGE_SQL);
  return projectHistory(items, topics, coverage?.started_at, hour, args);
}
