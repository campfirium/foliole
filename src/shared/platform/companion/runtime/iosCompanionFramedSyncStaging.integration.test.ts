import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../companionWorkspaceRuntimeRepository', async () => {
  const { createCompanionNativeSyncStub } = await import('./companionNativeSync.testSupport');
  return { FolioleCompanionSync: { ...createCompanionNativeSyncStub(),
    maintainAttachmentFiles: vi.fn(async () => ({ files: [] })) } };
});

import { COMPANION_SCHEMA_STATEMENTS } from '../../../../../lib/core/database/companionSchemaStatements';
import { FRAMED_SYNC_STAGING_SCHEMA } from '../../../../../lib/core/database/framedSyncStagingSchema';
import { COMPANION_DATABASE_VERSION } from '../../../../../lib/platform/nativeCompanionContract';
import { createFakeCapacitorConnection } from '../../companionSyncNodeVersionsTestSupport';

import {
  closeIosCompanionDatabase,
  initializeIosCompanionDatabase,
  type IosCompanionDatabaseManager
} from './iosCompanionDatabaseBootstrap';

const roots: string[] = [];
const databases: Database.Database[] = [];
let previousStage = performance.now();

function traceStage(stage: string) {
  const now = performance.now();
  if (process.env.CI || process.env.FOLIOLE_REQUEST_SYNC_TRACE_ROOT) {
    process.stderr.write(`${JSON.stringify({ at: new Date().toISOString(), pid: process.pid,
      stage: `ios_staging.${stage}`, elapsedMs: now - previousStage })}\n`);
  }
  previousStage = now;
}

afterEach(async () => {
  traceStage('close.start');
  await closeIosCompanionDatabase();
  traceStage('close.end');
  for (const database of databases.splice(0)) database.close();
  traceStage('connections.closed');
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
  traceStage('directories.removed');
});

describe('iOS active companion framed sync staging', () => {
  it('installs the shared staging schema in a fresh active database', async () => {
    const fixture = databaseFixture(false);
    traceStage('initialize.start');
    await initializeIosCompanionDatabase(nativeState(), fixture.manager, {
      afterRepair: () => { traceStage('repair.complete'); }
    });
    traceStage('initialize.end');

    expect(framedTables(fixture.sqlite)).toEqual(expect.arrayContaining(
      FRAMED_SYNC_STAGING_SCHEMA.map((sql) => sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/u)![1])
    ));
    expect(fixture.sqlite.pragma('user_version', { simple: true })).toBe(COMPANION_DATABASE_VERSION);
    traceStage('assertions.complete');
  });

  it('upgrades a version 70 active database without losing business rows', async () => {
    traceStage('upgrade.start');
    const fixture = databaseFixture(true);
    traceStage('fixture.created');
    fixture.sqlite.exec(COMPANION_SCHEMA_STATEMENTS.filter((sql) => !sql.includes('framed_sync_')).join(';\n'));
    traceStage('old_schema.created');
    fixture.sqlite.prepare('INSERT INTO companion_meta VALUES (?, ?, ?)')
      .run('device_id', 'ios-device', '2026-10-05T00:00:00Z');
    fixture.sqlite.prepare(`INSERT INTO nodes
      (id, parent_id, kind, title, is_title_manual, hide_title_heading, content, sync_dirty,
       created_at, updated_at, deleted_at) VALUES (?, NULL, 'topic', 'Kept', 1, 0, '', 0, ?, ?, NULL)`)
      .run('kept-node', '2026-10-05T00:00:00Z', '2026-10-05T00:00:00Z');
    traceStage('business_rows.inserted');
    fixture.sqlite.pragma('user_version = 70');
    traceStage('version.set');

    traceStage('initialize.start');
    await initializeIosCompanionDatabase(nativeState(), fixture.manager, {
      afterRepair: () => { traceStage('repair.complete'); }
    });
    traceStage('initialize.end');

    expect(framedTables(fixture.sqlite)).toEqual(expect.arrayContaining(
      FRAMED_SYNC_STAGING_SCHEMA.map((sql) => sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/u)![1])
    ));
    expect(fixture.sqlite.prepare("SELECT title FROM nodes WHERE id = 'kept-node'").pluck().get()).toBe('Kept');
    expect(fixture.sqlite.pragma('user_version', { simple: true })).toBe(COMPANION_DATABASE_VERSION);
    traceStage('assertions.complete');
  });
});

function databaseFixture(existed: boolean) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-ios-framed-staging-'));
  roots.push(root);
  const databasePath = path.join(root, 'foliole-companionSQLite.db');
  const sqlite = new Database(databasePath);
  databases.push(sqlite);
  const connection = {
    ...createFakeCapacitorConnection(sqlite),
    getUrl: async () => ({ url: `file://${databasePath}` })
  };
  const manager = {
    closeConnection: async () => undefined,
    createConnection: async () => connection,
    isConnection: async () => ({ result: false }),
    isDatabase: async () => ({ result: existed }),
    retrieveConnection: async () => connection
  } as unknown as IosCompanionDatabaseManager;
  return { manager, sqlite };
}

function framedTables(sqlite: Database.Database) {
  return sqlite.prepare(`SELECT name FROM sqlite_master
    WHERE type = 'table' AND name LIKE 'framed_sync_%' ORDER BY name`).pluck().all();
}

function nativeState() {
  return {
    booted_at: '2026-10-05T00:00:00Z', database_path: null, database_ready: false,
    host_name: 'iPhone', runtime_kind: 'ios-capacitor' as const
  };
}
