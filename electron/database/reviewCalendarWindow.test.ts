// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { readReviewCalendarHistory } from '../../lib/core/database/reviewCalendarHistory.js';
import { INSERT_REVIEW_EVENT_SQL } from '../../lib/core/database/reviewLogRecord.js';
import { reviewCalendarDayKey } from '../../lib/core/review/reviewCalendarDates.js';

import { openNodeSqliteFixture } from './nodeSqliteFixture.testSupport.js';

it('uses a timestamp index range while honoring offsets and half-open review windows', () => {
  const { driver, sqlite } = openNodeSqliteFixture();
  try {
    const args = { from: '2026-10-02T00:00:00Z', to: '2026-10-03T00:00:00Z' };
    driver.execute('UPDATE topic_daily_count_coverage SET started_at = ?', ['2020-01-01T00:00:00Z']);
    const reviews = [
      ['old', '2020-10-02T00:00:00Z'],
      ['date-only', '2026-10-02'],
      ['offset-before', '2026-10-01T19:00:00-05:00'],
      ['offset-after', '2026-10-03T04:00:00+05:00'],
      ['upper-bound', '2026-10-03T01:00:00+01:00']
    ] as const;
    for (const [id, time] of reviews) {
      driver.execute(`INSERT INTO nodes (id, title, kind, content, created_at, updated_at)
        VALUES (?, ?, 'item', 'content', ?, ?)`, [id, id, time, time]);
      driver.execute(INSERT_REVIEW_EVENT_SQL, [id, id, 'test-host', id, 3, 'fsrs', time, 'review', null]);
    }
    const queries = vi.spyOn(driver, 'queryAll');
    const history = readReviewCalendarHistory(driver, args, 0);
    expect(history.days.reduce((total, day) => total + day.items, 0)).toBe(3);
    const [sql, params] = queries.mock.calls.find(([statement]) => statement.includes('FROM review_log r'))!;
    const plan = driver.queryAll<{ detail: string }>(`EXPLAIN QUERY PLAN ${sql}`, params);
    expect(plan.some(({ detail }) => /SEARCH r .*reviewed_at>\? AND reviewed_at<\?/.test(detail))).toBe(true);
    expect(plan.some(({ detail }) => detail.includes('idx_review_log_calendar_legacy'))).toBe(true);
  } finally { sqlite.close(); }
});

it('counts old spellings in the same half-open window as replayed reviews', () => {
  const { driver, sqlite } = openNodeSqliteFixture();
  try {
    const reviews = [
      ['two-digit-year', '0049-02-30 12:00Z'],
      ['numeric', '2049/02/30 12:00:00Z'],
      ['month-name', '2 Mar 2049 12:00:00Z'],
      ['rounded-fraction', '2049-03-02t12:00:00.123999z'],
      ['outside-window', '2049-03-02T12:00:00.124Z'],
      ['legacy-rollover', '2049-02-31T24:00:00-23:59'],
    ] as const;
    for (const [id, time] of reviews) {
      driver.execute(`INSERT INTO nodes (id, title, kind, content, created_at, updated_at)
        VALUES (?, ?, 'item', 'content', ?, ?)`, [id, id, time, time]);
      driver.execute(INSERT_REVIEW_EVENT_SQL, [id, id, 'test-host', id, 3, 'fsrs', time, 'review', null]);
    }
    const start = '2049-03-02T12:00:00.000Z';
    const rollover = '2049-03-04T23:59:00Z';
    const history = readReviewCalendarHistory(driver, { from: start, to: '2049-03-02T12:00:00.124Z' }, 0);
    expect(history.days).toEqual([expect.objectContaining({ day: reviewCalendarDayKey(new Date(start), 0), items: 4 })]);
    const late = readReviewCalendarHistory(driver, { from: rollover, to: '2049-03-05T00:00:00Z' }, 0);
    expect(late.days).toEqual([expect.objectContaining({ day: reviewCalendarDayKey(new Date(rollover), 0), items: 1 })]);
  } finally { sqlite.close(); }
});
