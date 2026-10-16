// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { applySyncObjectsWithDbPort } from '../sync/syncObjectApplyExecutor.js';

import { COMPANION_SCHEMA_STATEMENTS } from './companionSchemaStatements.js';
import { migrateCompanionForegroundSources, migrateForegroundSources } from './foregroundSourceMigration.js';
import { computeSyncContentHash } from './syncState.js';

const source = '11111111-1111-4111-8111-111111111111';
function library() {
  const db = new Database(':memory:');
  for (const sql of COMPANION_SCHEMA_STATEMENTS) db.exec(sql);
  return db;
}
it('collapses daily inventory into one source on both hosts without changing any daily facts', async () => {
  for (const host of ['desktop', 'companion']) {
    const db = library();
    try {
      for (const [day, duration] of [['2026-10-01', 50], ['2026-10-02', 70]] as const) {
        db.prepare('INSERT INTO foreground_daily_time VALUES (?, ?, ?, ?)').run(`${source}:${day}`, source, day, duration);
        db.prepare(`INSERT INTO sync_object_state(object_type, object_id, state_seq, content_hash, updated_at, last_modified_by_host_name)
          VALUES ('foreground_daily_time', ?, ?, ?, ?, 'fixture')`).run(`${source}:${day}`, duration, 'a'.repeat(64), day);
      }
      const before = db.prepare('SELECT * FROM foreground_daily_time ORDER BY id').all();
      if (host === 'desktop') migrateForegroundSources(db);
      else await migrateCompanionForegroundSources(createBetterSqliteDbPort(db));
      expect(db.prepare('SELECT * FROM foreground_daily_time ORDER BY id').all()).toEqual(before);
      expect(db.prepare('SELECT object_type, object_id, content_hash FROM sync_object_state').all()).toEqual([{
        object_type: 'foreground_source', object_id: source,
        content_hash: computeSyncContentHash('foreground_source', { source_id: source, days: { '2026-10-01': 50, '2026-10-02': 70 } })
      }]);
    } finally { db.close(); }
  }
});
it('merges disjoint daily maxima and publishes the merged hash instead of the incoming hash', async () => {
  const db = library(); const port = createBetterSqliteDbPort(db);
  const record = (days: Record<string, number>) => ({ object_type: 'foreground_source' as const, object_id: source,
    payload_json: JSON.stringify({ source_id: source, days }),
    content_hash: computeSyncContentHash('foreground_source', { source_id: source, days }),
    updated_at: '2026-10-16', deleted_at: null });
  try {
    await applySyncObjectsWithDbPort(port, [record({ '2026-10-01': 100, '2026-10-02': 20 })]);
    await applySyncObjectsWithDbPort(port, [record({ '2026-10-01': 50, '2026-10-02': 200, '2026-10-03': 300 })]);
    expect(db.prepare('SELECT content_hash FROM sync_object_state').get()).toEqual({
      content_hash: record({ '2026-10-01': 100, '2026-10-02': 200, '2026-10-03': 300 }).content_hash
    });
    expect(db.prepare('SELECT SUM(duration_ms) total FROM foreground_daily_time').get()).toEqual({ total: 600 });
  } finally { db.close(); }
});
