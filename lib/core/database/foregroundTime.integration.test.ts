// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { build } from 'vite';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { closeLibraries, createPeer, joinPeers, startLibraries } from '../../../electron/database/syncLibrary.testSupport.js';
import { syncRequestLibrary } from '../../../electron/database/syncRequestLibrary.testSupport.js';
import { iosCompanionContentHash, markIosCompanionMutation } from '../../../src/shared/platform/companion/runtime/iosCompanionMutationState.js';
import type { NativeSyncObjectRecord } from '../../platform/nativeSyncContract.js';
import { applySyncObjectsWithDbPort } from '../sync/syncObjectApplyExecutor.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../sync/syncObjectPayloadSql.js';

import { migrateCompanionDatabase } from './companionDatabaseMigrationExecutor.js';
import { COMPANION_SCHEMA_STATEMENTS } from './companionSchemaStatements.js';
import { DATABASE_SCHEMA_VERSION } from './databaseSchemaVersion.js';
import { DESKTOP_FRESH_SCHEMA_STATEMENTS } from './desktopFreshSchemaStatements.js';
import { readForegroundTimeHistory } from './foregroundTimeHistory.js';
import { saveForegroundTime } from './foregroundTimeStore.js';
import { initializeDatabaseSchema } from './migrations.js';
import { SYNC_IDENTITY_INDEX_SCHEMA_STATEMENTS } from './syncIdentityIndexSchemaStatements.js';

const connections: Database.Database[] = [];

it.each(['America/New_York', 'Asia/Shanghai', 'UTC'])('keeps learning days and durable foreground buckets at local clock boundaries in %s', async (zone) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'foliole-day-boundary-'));
  try {
    // A new process fixes the actual Date timezone even when Vitest runs in worker threads.
    const built = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
      lib: { entry: 'electron/database/reviewDayBoundary.testSupport.ts', formats: ['cjs'] },
      rolldownOptions: { platform: 'node',
        external: (id, importer) => Boolean(importer && !id.startsWith('.') && !path.isAbsolute(id)) } } });
    const output = Array.isArray(built) ? built[0] : built;
    if (!output || !('output' in output)) throw new Error('Missing timezone scenario output');
    const chunk = output.output[0]!;
    if (chunk.type !== 'chunk') throw new Error('Missing timezone scenario bundle');
    const bundle = chunk.code;
    const result = execFileSync(process.execPath, ['-e', `${bundle}\nmodule.exports.verifyReviewDayBoundary(process.argv[1]).then(value => console.log(JSON.stringify(value)));`, root],
      { cwd: process.cwd(), env: { ...process.env, TZ: zone }, encoding: 'utf8', timeout: 30_000 });
    expect(JSON.parse(result)).toMatchObject({ zone, verified: true });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
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
    mark: (tx, record) => markIosCompanionMutation({ db: tx, hostName: 'mobile', objectType: 'foreground_source',
      objectId: record.id, contentHash: record.hash, updatedAt: record.updatedAt }) });
}
function records(db: ReturnType<typeof instance>): NativeSyncObjectRecord[] {
  return db.sql.prepare(`SELECT s.object_type, s.object_id, s.content_hash, s.deleted_at, s.updated_at,
    json_object('source_id', s.object_id, 'days', json((SELECT json_group_object(day_key, duration_ms)
      FROM foreground_daily_time t WHERE t.source_id = s.object_id))) payload_json
    FROM sync_object_state s WHERE s.object_type = 'foreground_source'`).all() as NativeSyncObjectRecord[];
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

it('applies cumulative request payloads and state together while rejecting a newer timestamp with a smaller total', async () => {
  await startLibraries();
  try {
    const source = createPeer('source'); const target = createPeer('target'); const smaller = createPeer('smaller');
    joinPeers(source, target, smaller);
    const db = { sql: target.db, port: target.port };
    await save(db, sourceA, 60_000);
    await save({ sql: source.db, port: source.port }, sourceA, 120_000);
    await save({ sql: smaller.db, port: smaller.port }, sourceA, 30_000);
    const record = records({ sql: source.db, port: source.port })[0]!;
    const payload = JSON.parse(record.payload_json!) as { source_id: string; days: Record<string, number> };
    source.db.exec("UPDATE sync_object_state SET updated_at = '2000-01-01' WHERE object_type = 'foreground_source'");
    smaller.db.exec("UPDATE sync_object_state SET updated_at = '2099-01-01' WHERE object_type = 'foreground_source'");
    await syncRequestLibrary(source, target);
    expect(db.sql.prepare('SELECT duration_ms FROM foreground_daily_time').get()).toEqual({ duration_ms: 120_000 });
    expect(db.sql.prepare('SELECT content_hash FROM sync_object_state WHERE object_id = ?').get(record.object_id))
      .toEqual({ content_hash: record.content_hash });
    await syncRequestLibrary(smaller, target);
    expect(db.sql.prepare('SELECT duration_ms FROM foreground_daily_time').get()).toEqual({ duration_ms: 120_000 });
    expect(db.sql.prepare('SELECT content_hash FROM sync_object_state WHERE object_id = ?').get(record.object_id))
      .toEqual({ content_hash: record.content_hash });
    expect(db.sql.prepare(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.foreground_source).get(record.object_id)).toEqual({
      payload_json: JSON.stringify({ ...payload, days: { '2026-10-04': 120_000 } }) });
  } finally { await closeLibraries(); }
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
    ...[{ source_id: 'bad', days: { '2026-10-04': 90_000 } },
      { source_id: sourceA, days: { '2026-02-30': 90_000 } },
      { source_id: sourceA, days: { '2026-10-04': -1 } }].map((payload) => ({ payload_json: JSON.stringify(payload) }))
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
  for (const [schema, version] of [[DESKTOP_FRESH_SCHEMA_STATEMENTS, 128],
    [DESKTOP_FRESH_SCHEMA_STATEMENTS, 133], [COMPANION_SCHEMA_STATEMENTS, 66]] as const) {
    const db = new Database(':memory:'); connections.push(db);
    for (const sql of schema) db.exec(sql);
    db.exec(`DROP TABLE foreground_daily_time; DROP TABLE foreground_time_coverage;
      INSERT INTO nodes(id, title, created_at, updated_at) VALUES ('retained', 'Retained', '2026-10-01', '2026-10-01');
      INSERT INTO node_reading(node_id, last_handled_at, next_at, repetition_count, state) VALUES ('retained', '2026-10-01', '2026-10-04', 7, 'active')`);
    if (schema === DESKTOP_FRESH_SCHEMA_STATEMENTS) {
      // These versions predate Flow; do not feed the current cycle schema into its later migration.
      const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'daily_flow_%'").all() as { name: string }[];
      for (const { name } of triggers) db.exec(`DROP TRIGGER ${name}`);
      for (const table of ['daily_flow_entries', 'daily_flow_state', 'daily_flow_operations', 'daily_flow_sync_facts', 'daily_flow_sync_projection']) {
        db.exec(`DROP TABLE ${table}`);
      }
      if (version >= 129) {
        for (const statement of SYNC_IDENTITY_INDEX_SCHEMA_STATEMENTS) db.exec(statement);
      }
      db.pragma(`user_version = ${version}`); initializeDatabaseSchema(db);
      expect(db.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
    } else {
      const port = createBetterSqliteDbPort(db);
      await port.transaction((tx) => migrateCompanionDatabase(tx, 66, 68));
    }
    expect(db.prepare('SELECT repetition_count FROM node_reading').pluck().get()).toBe(7);
    expect(db.prepare('SELECT count(*) FROM foreground_daily_time').pluck().get()).toBe(0);
    expect(db.prepare('SELECT started_at FROM foreground_time_coverage').pluck().get()).toBeTruthy();
  }
});

it('returns a lifetime total independent of the requested calendar window, including each unsaved excess once', async () => {
  const db = instance(); await save(db, sourceA, 60_000);
  db.sql.prepare('INSERT INTO foreground_daily_time VALUES (?, ?, ?, ?)')
    .run(`${sourceB}:2026-09-15`, sourceB, '2026-09-15', 120_000);
  const pending = { sourceId: sourceB, buckets: [
    { day: '2026-09-15', durationMs: 130_000 }, { day: '2026-10-04', durationMs: 20_000 }
  ] };
  const october = await readForegroundTimeHistory(db.port, { fromDay: '2026-10-01', toDay: '2026-11-01' }, 4, pending);
  expect(october.totalDurationMs).toBe(210_000);
  expect(october.days).toEqual([{ day: '2026-10-04', durationMs: 80_000 }]);
  const september = await readForegroundTimeHistory(db.port, { fromDay: '2026-09-01', toDay: '2026-10-01' }, 4, pending);
  expect(september.totalDurationMs).toBe(210_000);
  expect(september.days).toEqual([{ day: '2026-09-15', durationMs: 130_000 }]);
  const maintenance = await readForegroundTimeHistory(db.port, { fromDay: '2026-10-01', toDay: '2026-11-01' }, 4,
    { sourceId: sourceB, buckets: [{ day: '2026-09-15', durationMs: 10_000 }], unassigned: true });
  expect(maintenance.totalDurationMs).toBe(190_000);
  expect(db.sql.prepare('SELECT SUM(duration_ms) FROM foreground_daily_time').pluck().get()).toBe(180_000);
});

it('reports a known zero lifetime total for an initialized empty library', async () => {
  const db = instance();
  expect(await readForegroundTimeHistory(db.port, { fromDay: '2026-10-01', toDay: '2026-11-01' }, 4))
    .toMatchObject({ totalDurationMs: 0, days: [] });
});

it('keeps one published object per source as new days accumulate', async () => {
  const db = instance();
  for (const day of ['2026-10-01', '2026-10-02', '2026-10-03']) {
    await saveForegroundTime(db.port, { sourceId: sourceA, buckets: [{ day, durationMs: 60_000 }], hash: iosCompanionContentHash,
      mark: (tx, record) => markIosCompanionMutation({ db: tx, hostName: 'mobile', objectType: 'foreground_source',
        objectId: record.id, contentHash: record.hash, updatedAt: record.updatedAt }) });
  }
  expect(db.sql.prepare('SELECT COUNT(*) total FROM sync_object_state').get()).toEqual({ total: 1 });
  expect(db.sql.prepare('SELECT SUM(duration_ms) total FROM foreground_daily_time').get()).toEqual({ total: 180_000 });
});
