import type { NativeReviewCalendarDay } from '../../platform/nativeReviewCalendarContract.js';
import { reviewCalendarDayKey } from '../review/reviewCalendarDates.js';
import { resolveReadingAvailableAt, resolveStoredReviewDueAt } from '../review/reviewDayBoundary.js';

import type { DatabaseDriver, DatabaseRow } from './driver.js';

interface ScheduledRow extends DatabaseRow {
  bucket: 'items' | 'topics';
  due: string;
  last_handled_at: string | null;
  scheduled_days: number;
}

const CANDIDATES_SQL = `WITH RECURSIVE candidates AS (
  SELECT n.id, n.parent_id, n.deleted_at, n.shelved_at, 'topics' AS bucket,
    rd.next_at AS due, rd.last_handled_at, 0 AS scheduled_days
  FROM node_reading rd JOIN nodes n ON n.id=rd.node_id
  WHERE n.kind='topic' AND rd.state='active' AND typeof(rd.last_handled_at)='text'
    AND typeof(rd.next_at)='text' AND (n.body_blob_hash IS NOT NULL OR LENGTH(TRIM(n.content))>0)
    AND NOT(CASE WHEN n.anchor_resolution_status LIKE 'unmapped_%' THEN 0
      WHEN json_valid(n.anchor_link) THEN COALESCE(json_extract(n.anchor_link,'$.kind')='image-excerpt',0) ELSE 0 END)
  UNION ALL
  SELECT n.id, n.parent_id, n.deleted_at, n.shelved_at, 'items',
    COALESCE(nr.due,n.created_at), NULL, COALESCE(nr.scheduled_days,0)
  FROM nodes n LEFT JOIN node_review nr ON nr.node_id=n.id WHERE n.kind='item'
    AND NOT(CASE WHEN n.anchor_resolution_status LIKE 'unmapped_%' THEN 0
      WHEN json_valid(n.anchor_link) THEN COALESCE(json_extract(n.anchor_link,'$.kind')='image-excerpt',0) ELSE 0 END)
), ancestors(target,id,parent_id,deleted_at,shelved_at) AS (
  SELECT id,id,parent_id,deleted_at,shelved_at FROM candidates
  UNION
  SELECT a.target,p.id,p.parent_id,p.deleted_at,p.shelved_at FROM ancestors a JOIN nodes p ON p.id=a.parent_id
), allowed AS (
  SELECT target FROM ancestors GROUP BY target
  HAVING MAX(deleted_at IS NOT NULL AND deleted_at!='')=0
    AND (MAX(shelved_at IS NOT NULL AND shelved_at!='')=0
      OR EXISTS(SELECT 1 FROM candidates c WHERE c.id=target AND c.bucket='items'))
) SELECT c.bucket,c.due,c.last_handled_at,c.scheduled_days
  FROM candidates c JOIN allowed a ON a.target=c.id`;

/** Owns only this read's date fields; no node/profile graph escapes to the renderer. */
export function readReviewCalendarSchedule(driver: DatabaseDriver, now: string, hour: number): NativeReviewCalendarDay[] {
  if (!Number.isFinite(Date.parse(now))) throw new Error('Invalid calendar time');
  const today = reviewCalendarDayKey(new Date(now), hour);
  const days = new Map<string, NativeReviewCalendarDay>();
  for (const row of driver.queryAll<ScheduledRow>(CANDIDATES_SQL)) {
    const available = row.bucket === 'topics'
      ? resolveReadingAvailableAt({ lastHandledAt: row.last_handled_at, nextAt: row.due, newDayStartsAtHour: hour })
      : resolveStoredReviewDueAt({ due: row.due, scheduledDays: row.scheduled_days, newDayStartsAtHour: hour });
    const dueDay = reviewCalendarDayKey(new Date(available), hour);
    const day = dueDay < today ? today : dueDay;
    const entry = days.get(day) ?? { day, items: 0, topics: 0 };
    entry[row.bucket] = (entry[row.bucket] ?? 0) + 1;
    days.set(day, entry);
  }
  return [...days.values()].sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : 0);
}
