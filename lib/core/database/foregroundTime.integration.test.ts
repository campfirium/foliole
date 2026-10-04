// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { iosCompanionContentHash, markIosCompanionMutation } from '../../../src/shared/platform/companion/runtime/iosCompanionMutationState.js';
import type { NativeSyncObjectRecord } from '../../platform/nativeSyncContract.js';
import { applySyncObjectsWithDbPort } from '../sync/syncObjectApplyExecutor.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../sync/syncObjectPayloadSql.js';
import { applySyncPackLearningObjectsWithDbPort } from '../sync/syncPackLearningObjectsExecutor.js';
import { applySyncPackStateRowsWithDbPort } from '../sync/syncPackStateRowsExecutor.js';

import { migrateCompanionDatabase } from './companionDatabaseMigrationExecutor.js';
import { COMPANION_SCHEMA_STATEMENTS } from './companionSchemaStatements.js';
import { DESKTOP_FRESH_SCHEMA_STATEMENTS } from './desktopFreshSchemaStatements.js';
import { readForegroundTimeHistory } from './foregroundTimeHistory.js';
import { saveForegroundTime } from './foregroundTimeStore.js';
import { initializeDatabaseSchema } from './migrations.js';

const connections: Database.Database[] = [];
const sourceA = '11111111-1111-4111-8111-111111111111';
const sourceB = '22222222-2222-4222-8222-222222222222';
function instance() {
  const sql = new Database(':memory:'); connections.push(sql);
  for (const statement of COMPANION_SCHEMA_STATEMENTS) sql.exec(statement);
  return { sql, port: createBetterSqliteDbPort(sql) };
}
afterEach(() => { for (const db of connections.splice(0)) db.close(); });
async function save(db: ReturnType<typeof instance>, sourceId: string, durationMs: number) {
  await saveForegroundTime(db.port, { sourceId, buckets: [{ day: '2026-10-04', durationMs }], hash: iosCompanionContentHash,
    mark: (tx, record) => markIosCompanionMutation({ db: tx, hostName: 'mobile', objectType: 'foreground_daily_time',
      objectId: record.id, contentHash: record.hash, updatedAt: record.updatedAt }) });
}
function records(db: ReturnType<typeof instance>): NativeSyncObjectRecord[] {
  return db.sql.prepare(`SELECT s.object_type, s.object_id, s.content_hash, s.deleted_at, s.updated_at,
    json_object('source_id', t.source_id, 'day_key', t.day_key, 'duration_ms', t.duration_ms) payload_json
    FROM sync_object_state s JOIN foreground_daily_time t ON t.id = s.object_id
    WHERE s.object_type = 'foreground_daily_time'`).all() as NativeSyncObjectRecord[];
}

it('persists per-source cumulative time, combines devices and preserves totals across replay and older timestamps', async () => {
  const mobile = instance(); const desktop = instance();
  await save(mobile, sourceA, 60_000); await save(desktop, sourceB, 120_000);
  const older = records(mobile);
  await applySyncObjectsWithDbPort(desktop.port, older);
  await save(mobile, sourceA, 90_000);
  const newer = records(mobile).map((record) => ({ ...record, updated_at: '2000-01-01T00:00:00Z' }));
  await applySyncObjectsWithDbPort(desktop.port, newer);
  await applySyncObjectsWithDbPort(desktop.port, older);
  await applySyncObjectsWithDbPort(mobile.port, records(desktop));
  for (const db of [mobile, desktop]) {
    expect(db.sql.prepare('SELECT SUM(duration_ms) total FROM foreground_daily_time').get()).toEqual({ total: 210_000 });
  }
  const history = await readForegroundTimeHistory(desktop.port, { fromDay: '2026-10-01', toDay: '2026-11-01' }, 4,
    { sourceId: sourceB, buckets: [{ day: '2026-10-04', durationMs: 130_000 }] });
  expect(history.days).toEqual([{ day: '2026-10-04', durationMs: 220_000 }]);
  expect(desktop.sql.prepare('SELECT SUM(duration_ms) total FROM foreground_daily_time').get()).toEqual({ total: 210_000 });
});

it('applies cumulative pack payloads and state together while rejecting a newer timestamp with a smaller total', async () => {
  const db = instance(); await save(db, sourceA, 60_000);
  db.sql.exec(`ATTACH DATABASE ':memory:' AS inc;
    CREATE TABLE inc.sync_object_state AS SELECT * FROM main.sync_object_state;
    CREATE TABLE inc.sync_objects(object_type TEXT, object_id TEXT, content_hash TEXT, payload_json TEXT, updated_at TEXT, deleted_at TEXT);
    CREATE TABLE inc.nodes(id TEXT, current_version_id TEXT);`);
  const record = records(db)[0]!;
  const payload = JSON.parse(record.payload_json!) as { source_id: string; day_key: string; duration_ms: number };
  db.sql.prepare('INSERT INTO inc.sync_objects VALUES (?, ?, ?, ?, ?, ?)').run(record.object_type, record.object_id,
    'incoming',
    JSON.stringify({ ...payload, duration_ms: 120_000 }), '2000-01-01', null);
  db.sql.exec("UPDATE inc.sync_object_state SET updated_at = '2000-01-01', content_hash = 'incoming', state_seq = 10");
  await applySyncPackLearningObjectsWithDbPort(db.port, {});
  await applySyncPackStateRowsWithDbPort(db.port, { objectTypes: ['foreground_daily_time'] });
  expect(db.sql.prepare('SELECT duration_ms FROM foreground_daily_time').get()).toEqual({ duration_ms: 120_000 });
  expect(db.sql.prepare('SELECT content_hash FROM sync_object_state WHERE object_id = ?').get(record.object_id)).toEqual({ content_hash: 'incoming' });
  db.sql.prepare('UPDATE inc.sync_objects SET payload_json = ?, content_hash = ?, updated_at = ?').run(
    JSON.stringify({ ...payload, duration_ms: 30_000 }), 'smaller', '2099-01-01');
  db.sql.exec("UPDATE inc.sync_object_state SET updated_at = '2099-01-01', content_hash = 'smaller', state_seq = 20");
  await applySyncPackLearningObjectsWithDbPort(db.port, {});
  await applySyncPackStateRowsWithDbPort(db.port, { objectTypes: ['foreground_daily_time'] });
  expect(db.sql.prepare('SELECT duration_ms FROM foreground_daily_time').get()).toEqual({ duration_ms: 120_000 });
  expect(db.sql.prepare('SELECT content_hash FROM sync_object_state WHERE object_id = ?').get(record.object_id)).toEqual({ content_hash: 'incoming' });
  // The payload SQL also feeds the normal desktop pack builder.
  expect(db.sql.prepare(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.foreground_daily_time).get(record.object_id)).toEqual({
    payload_json: JSON.stringify({ ...payload, duration_ms: 120_000 }) });
});

it('does not write unchanged checkpoints and retries the full cumulative value after a failed transaction', async () => {
  const db = instance(); await save(db, sourceA, 60_000);
  const sequence = db.sql.prepare('SELECT state_seq FROM sync_object_state').get();
  await save(db, sourceA, 60_000); expect(db.sql.prepare('SELECT state_seq FROM sync_object_state').get()).toEqual(sequence);
  await expect(saveForegroundTime(db.port, { sourceId: sourceA, buckets: [{ day: '2026-10-04', durationMs: 90_000 }],
    hash: iosCompanionContentHash, mark: async () => { throw new Error('disk failure'); } })).rejects.toThrow('disk failure');
  expect(db.sql.prepare('SELECT duration_ms FROM foreground_daily_time').get()).toEqual({ duration_ms: 60_000 });
  await save(db, sourceA, 120_000);
  expect(db.sql.prepare('SELECT duration_ms FROM foreground_daily_time').get()).toEqual({ duration_ms: 120_000 });
});

it('rejects malformed identities, dates, durations and deletions before changing saved history', async () => {
  const db = instance(); await save(db, sourceA, 60_000);
  const record = records(db)[0]!;
  for (const changes of [
    { object_id: 'wrong-id' }, { deleted_at: '2026-10-04' },
    ...[{ source_id: 'bad', day_key: '2026-10-04', duration_ms: 90_000 },
      { source_id: sourceA, day_key: '2026-02-30', duration_ms: 90_000 },
      { source_id: sourceA, day_key: '2026-10-04', duration_ms: -1 }].map((payload) => ({ payload_json: JSON.stringify(payload) }))
  ]) {
    const skipped: unknown[] = [];
    expect(await applySyncObjectsWithDbPort(db.port, [{ ...record, ...changes }], {
      onSkippedRecord: (_record, reason) => skipped.push(reason)
    })).toEqual([]);
    expect(skipped).toHaveLength(1);
    expect(db.sql.prepare('SELECT duration_ms FROM foreground_daily_time').get()).toEqual({ duration_ms: 60_000 });
  }
});

it('upgrades desktop and companion storage while retaining existing reading data', async () => {
  for (const schema of [DESKTOP_FRESH_SCHEMA_STATEMENTS, COMPANION_SCHEMA_STATEMENTS]) {
    const db = new Database(':memory:'); connections.push(db);
    for (const sql of schema) db.exec(sql);
    db.exec(`DROP TABLE foreground_daily_time; DROP TABLE foreground_time_coverage;
      INSERT INTO nodes(id, title, created_at, updated_at) VALUES ('retained', 'Retained', '2026-10-01', '2026-10-01');
      INSERT INTO node_reading(node_id, last_handled_at, next_at, repetition_count, state) VALUES ('retained', '2026-10-01', '2026-10-04', 7, 'active')`);
    if (schema === DESKTOP_FRESH_SCHEMA_STATEMENTS) {
      db.pragma('user_version = 133'); initializeDatabaseSchema(db);
      expect(db.pragma('user_version', { simple: true })).toBe(134);
    } else {
      const port = createBetterSqliteDbPort(db);
      await port.transaction((tx) => migrateCompanionDatabase(tx, 66, 68));
    }
    expect(db.prepare('SELECT repetition_count FROM node_reading').pluck().get()).toBe(7);
    expect(db.prepare('SELECT count(*) FROM foreground_daily_time').pluck().get()).toBe(0);
    expect(db.prepare('SELECT started_at FROM foreground_time_coverage').pluck().get()).toBeTruthy();
  }
});
