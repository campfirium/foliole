// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { readReviewCalendarHistory } from '../../lib/core/database/reviewCalendarHistory.js';
import { INSERT_REVIEW_EVENT_SQL } from '../../lib/core/database/reviewLogRecord.js';

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
  } finally { sqlite.close(); }
});
