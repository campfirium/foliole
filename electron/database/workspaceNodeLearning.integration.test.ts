// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { DESKTOP_FRESH_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopFreshSchemaStatements.js';
import { readWorkspaceNodeLearning } from '../../lib/core/database/workspaceNodeLearning.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';

let db: Database.Database;
beforeEach(() => {
  db = new Database(':memory:');
  DESKTOP_FRESH_SCHEMA_STATEMENTS.forEach(sql => db.exec(sql));
  db.prepare('INSERT OR REPLACE INTO settings(key,value,updated_at) VALUES(?,?,?)').run('host_name', 'host-a', '2026-10-01');
  db.prepare(`INSERT INTO nodes(id,kind,title,content,created_at,updated_at) VALUES('a','topic','A','body',?,?)`)
    .run('2026-10-01', '2026-10-01');
});
afterEach(() => db.close());
it('reads only requested complete learning facts and the current host position without display data', () => {
  db.prepare(`INSERT INTO node_reading(node_id,interval_duration_ms,interval_growth_factor,last_handled_at,
    next_at,priority,repetition_count,state) VALUES('a',86400000,1.3,'2026-10-01','2026-10-02',5,19,'active')`).run();
  db.prepare('INSERT INTO node_reading_host_state(node_id,host_name,reading_position,updated_at) VALUES(?,?,?,?)')
    .run('a', 'host-a', 27, '2026-10-01');
  db.prepare('INSERT INTO node_reading_host_state(node_id,host_name,reading_position,updated_at) VALUES(?,?,?,?)')
    .run('a', 'host-b', 99, '2026-10-01');
  db.exec('ALTER TABLE content_blobs RENAME TO inaccessible_bodies');
  const values = readWorkspaceNodeLearning(createBetterSqlite3Driver(db), ['a', 'missing']);
  expect(values).toEqual([{ nodeId: 'a', review: null, reading: {
    intervalDurationMs: 86400000, intervalGrowthFactor: 1.3, lastHandledAt: '2026-10-01', nextAt: '2026-10-02',
    priority: 5, repetitionCount: 19, state: 'active', readingPosition: 27
  } }]);
  db.prepare('UPDATE node_reading SET repetition_count=20').run();
  expect(readWorkspaceNodeLearning(createBetterSqlite3Driver(db), ['a'])[0]?.reading?.repetitionCount).toBe(20);
});
it('distinguishes an existing unlearned node from a missing node and handles an empty request', () => {
  const driver = createBetterSqlite3Driver(db);
  expect(readWorkspaceNodeLearning(driver, ['a'])).toEqual([{ nodeId: 'a', reading: null, review: null }]);
  expect(readWorkspaceNodeLearning(driver, ['missing'])).toEqual([]);
  expect(readWorkspaceNodeLearning(driver, [])).toEqual([]);
});
