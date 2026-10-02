// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { DESKTOP_FRESH_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopFreshSchemaStatements.js';
import { saveNodeReadingStateWithSync } from '../../lib/core/database/nodeReadingSyncState.js';
import { readReviewCalendarHistory } from '../../lib/core/database/reviewCalendarHistory.js';
import { applyReviewGrade } from '../../lib/core/database/reviewMutations.js';
import { applySyncObjectsWithDbPort } from '../../lib/core/sync/syncObjectApplyExecutor.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { loadSyncObjectsFromDriver } from './syncObjectsFromDriver.js';
import { loadPackRows, loadMaxStateSeq } from './syncPackRows.js';

const databases: BetterSqlite3.Database[] = [];
const roots: string[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) if (db.open) db.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function open(name = ':memory:') {
  const db = new BetterSqlite3(name);
  databases.push(db);
  for (const sql of DESKTOP_FRESH_SCHEMA_STATEMENTS) db.exec(sql);
  const driver = createBetterSqlite3Driver(db);
  return { db, driver, port: createBetterSqliteDbPort(db) };
}

function topic(source: ReturnType<typeof open>, id = 'topic-a') {
  source.driver.execute(`INSERT INTO nodes(id, kind, title, content, created_at, updated_at)
    VALUES (?, 'topic', '', 'content', ?, ?)`, [id, '2026-10-01T08:00:00Z', '2026-10-01T08:00:00Z']);
}

function read(source: ReturnType<typeof open>, day?: string, id = 'topic-a', hostName = 'host-a') {
  const input = {
    nodeId: id, hostName, updatedAt: '2026-10-02T08:00:00Z',
    reading: {
      intervalDurationMs: 86400000, intervalGrowthFactor: 2, lastHandledAt: '2026-10-02T08:00:00Z',
      nextAt: '2026-10-03T08:00:00Z', priority: 0, readingPosition: 0, repetitionCount: 1, state: 'active' as const
    },
    ...(day === undefined ? {} : { completedReviewDay: day })
  };
  saveNodeReadingStateWithSync(source.driver, input);
}

function counts(source: ReturnType<typeof open>) {
  return source.driver.queryAll('SELECT day_key, count FROM topic_daily_counts ORDER BY day_key');
}

it('counts distinct completed Topics per day without counting other reading-state writes', () => {
  const source = open();
  topic(source); topic(source, 'topic-b');
  read(source);
  expect(counts(source)).toEqual([]);
  read(source, '2026-10-02'); read(source, '2026-10-02');
  read(source, '2026-10-02', 'topic-b'); read(source, '2026-10-03');
  expect(counts(source)).toEqual([{ day_key: '2026-10-02', count: 2 }, { day_key: '2026-10-03', count: 1 }]);
});

it('rolls back reading and count together when the completion day is invalid', () => {
  const source = open(); topic(source);
  expect(() => read(source, '2026-02-30')).toThrow('Invalid review day');
  expect(source.driver.queryAll('SELECT * FROM node_reading')).toEqual([]);
  expect(counts(source)).toEqual([]);
});

it('merges overlapping daily counts through production sync payloads and retains them after reopen', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'foliole-calendar-count-')); roots.push(root);
  const a = open(); const b = open(path.join(root, 'b.db'));
  topic(a); topic(a, 'topic-b'); topic(b);
  read(a, '2026-10-02'); read(a, '2026-10-02', 'topic-b'); read(b, '2026-10-02', 'topic-a', 'host-b');
  const packed = loadPackRows(0, loadMaxStateSeq(a.driver), a.driver).syncObjects
    .filter((record) => record.object_type === 'topic_daily_count');
  expect(packed).toHaveLength(2);
  await applySyncObjectsWithDbPort(b.port, packed);
  await applySyncObjectsWithDbPort(b.port, packed);
  expect(counts(b)).toEqual([{ day_key: '2026-10-02', count: 2 }]);
  const reverse = loadSyncObjectsFromDriver(b.driver, packed.map((r) => r.object_id), ['topic_daily_count']);
  await applySyncObjectsWithDbPort(a.port, reverse);
  expect(counts(a)).toEqual(counts(b));
  b.db.close();
  expect(counts(open(path.join(root, 'b.db')))).toEqual([{ day_key: '2026-10-02', count: 2 }]);
});

it('rejects a sync payload whose object identity does not match its counting day', async () => {
  const a = open(); const b = open(); topic(a); read(a, '2026-10-02');
  const [record] = loadSyncObjectsFromDriver(a.driver, ['2026-10-02:topic-a'], ['topic_daily_count']);
  const skipped: unknown[] = [];
  await applySyncObjectsWithDbPort(b.port, [{ ...record!, payload_json: '{"day_key":"2026-10-03","node_id":"topic-a"}' }], {
    onSkippedRecord: (_record, error) => skipped.push(error)
  });
  expect(skipped).toHaveLength(1);
  expect(counts(b)).toEqual([]);
});

it('reads distinct historical Items independently of Topics and respects the review-day boundary', () => {
  const source = open(); topic(source); topic(source, 'item-a');
  source.driver.execute("UPDATE nodes SET kind = 'item', parent_id = 'topic-a' WHERE id = 'item-a'");
  const iso = (day: number, hour: number) => new Date(2026, 9, day, hour).toISOString();
  source.driver.execute('UPDATE topic_daily_count_coverage SET started_at = ?', [iso(1, 4)]);
  let id = 0;
  const card = {
    due: iso(3, 4), last_review: null, state: 2 as const, stability: 1, difficulty: 1,
    elapsed_days: 1, scheduled_days: 1, reps: 1, lapses: 0
  };
  for (const reviewedAt of [iso(2, 3), iso(2, 8), iso(2, 10)]) {
    applyReviewGrade(source.driver, {
      nodeId: 'item-a', grade: 3, reviewedAt, schedulerVersion: 'test', cardBefore: card, cardAfter: card
    }, { hostName: 'host-a', createId: () => `review-${id++}` });
  }
  read(source, '2026-10-02');
  const history = readReviewCalendarHistory(source.driver, { from: iso(1, 4), to: iso(3, 4) }, 4);
  expect(history.days).toEqual([
    { day: '2026-10-01', items: 1, topics: 0 },
    { day: '2026-10-02', items: 1, topics: 1 }
  ]);
  source.driver.execute('UPDATE topic_daily_count_coverage SET started_at = ?', [iso(3, 4)]);
  expect(readReviewCalendarHistory(source.driver, { from: iso(1, 4), to: iso(3, 4) }, 4).days[0]?.topics).toBeNull();
  expect(readReviewCalendarHistory(source.driver, { from: iso(1, 4), to: iso(3, 4) }, 4).days[1]?.topics).toBe(1);
  expect(() => readReviewCalendarHistory(source.driver, { from: 'invalid', to: iso(3, 4) }, 4)).toThrow('Invalid calendar range');
});
