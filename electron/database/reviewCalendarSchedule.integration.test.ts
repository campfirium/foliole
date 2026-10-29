// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { DESKTOP_FRESH_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopFreshSchemaStatements.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { loadReviewCalendarHistory } from './reviewCalendar.js';

const state = vi.hoisted(() => ({ driver: null as unknown }));
vi.mock('./connection.js', () => ({ openDatabaseConnection: () => ({ driver: state.driver }) }));
vi.mock('../reviewSchedulerSettings.js', () => ({ loadReviewSchedulerSettings: () => ({ newDayStartsAtHour: 4 }) }));

let db: Database.Database;
const now = '2026-10-02T08:00:00.000Z';
const tomorrow = '2026-10-03T08:00:00.000Z';
beforeEach(() => {
  db = new Database(':memory:');
  DESKTOP_FRESH_SCHEMA_STATEMENTS.forEach(sql => db.exec(sql));
  state.driver = createBetterSqlite3Driver(db);
});
afterEach(() => db.close());
function node(id: string, kind = 'topic', parent: string | null = null) {
  db.prepare('INSERT INTO nodes(id,kind,parent_id,title,content,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .run(id, kind, parent, id, 'body', now, now);
}
function reading(id: string, due = tomorrow, state = 'active') {
  db.prepare(`INSERT INTO node_reading(node_id,interval_duration_ms,interval_growth_factor,last_handled_at,
    next_at,priority,repetition_count,state) VALUES(?,86400000,1.3,?,?,5,1,?)`).run(id, now, due, state);
}
function calendar() {
  return loadReviewCalendarHistory({ from: '2026-05-01T00:00:00.000Z', to: '2027-05-01T00:00:00.000Z', now });
}
it('returns future counts from persisted learning without a renderer node table', () => {
  node('started'); reading('started'); node('unstarted'); node('new-card', 'item');
  expect(calendar()).toMatchObject({ scheduledDays: [
    { day: '2026-10-02', items: 1, topics: 0 }, { day: '2026-10-03', items: 0, topics: 1 }
  ] });
  db.prepare('UPDATE node_reading SET next_at=?').run('2026-10-04T08:00:00.000Z');
  expect(calendar().scheduledDays).toContainEqual({ day: '2026-10-04', items: 0, topics: 1 });
});
it('preserves distinct ancestor visibility and scheduled reading states', () => {
  node('parent', 'folder'); node('topic', 'topic', 'parent'); reading('topic'); node('item', 'item', 'parent');
  db.prepare('UPDATE nodes SET shelved_at=? WHERE id=?').run(now, 'parent');
  expect(calendar().scheduledDays).toEqual([{ day: '2026-10-02', items: 1, topics: 0 }]);
  db.prepare('UPDATE nodes SET deleted_at=? WHERE id=?').run(now, 'parent');
  expect(calendar().scheduledDays).toEqual([]);
  db.prepare('UPDATE nodes SET deleted_at=NULL,shelved_at=NULL').run();
  db.prepare("UPDATE node_reading SET state='locked'").run();
  expect(calendar().scheduledDays).toEqual([{ day: '2026-10-02', items: 1, topics: 0 }]);
});
it('uses the reading and item day boundaries and clamps overdue work to today', () => {
  node('overdue'); reading('overdue', '2026-09-01T08:00:00.000Z');
  node('future'); reading('future', '2026-10-03T08:30:00.000Z');
  expect(calendar().scheduledDays).toEqual([
    { day: '2026-10-02', items: 0, topics: 1 }, { day: '2026-10-03', items: 0, topics: 1 }
  ]);
});

it('excludes empty reading and image excerpts while preserving external-body and unresolved-anchor eligibility', () => {
  for (const id of ['empty', 'external', 'excerpt', 'unmapped']) { node(id); reading(id); }
  db.prepare("UPDATE nodes SET content='' WHERE id IN ('empty','external')").run();
  db.prepare("UPDATE nodes SET body_blob_hash='external-body' WHERE id='external'").run();
  db.prepare('UPDATE nodes SET anchor_link=? WHERE id IN (?,?)')
    .run(JSON.stringify({ id: 'region', kind: 'image-excerpt' }), 'excerpt', 'unmapped');
  db.prepare("UPDATE nodes SET anchor_resolution_status='unmapped_missing' WHERE id='unmapped'").run();
  expect(calendar().scheduledDays).toEqual([{ day: '2026-10-03', items: 0, topics: 2 }]);
});

it('normalizes scheduled item days before the configured boundary without moving intraday items', () => {
  node('scheduled', 'item'); node('intraday', 'item');
  db.prepare(`INSERT INTO node_review(node_id,due,state,stability,difficulty,elapsed_days,scheduled_days,reps,lapses)
    VALUES(?,?,0,0,0,0,?,0,0)`).run('scheduled', '2026-10-03T02:00:00.000Z', 1);
  db.prepare(`INSERT INTO node_review(node_id,due,state,stability,difficulty,elapsed_days,scheduled_days,reps,lapses)
    VALUES(?,?,0,0,0,0,?,0,0)`).run('intraday', '2026-10-02T18:00:00.000Z', 0);
  expect(calendar().scheduledDays).toEqual([
    { day: '2026-10-02', items: 1, topics: 0 }, { day: '2026-10-03', items: 1, topics: 0 }
  ]);
});


it('counts every scheduled topic without session limits or expanding future repetitions', () => {
  db.transaction(() => { for (let i = 0; i < 120; i++) { node(`scheduled-${i}`); reading(`scheduled-${i}`); } })();
  expect(calendar().scheduledDays).toEqual([{ day: '2026-10-03', items: 0, topics: 120 }]);
});
