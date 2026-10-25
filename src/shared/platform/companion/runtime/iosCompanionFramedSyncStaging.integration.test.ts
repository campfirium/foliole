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
import { encodeFramedSyncManifest } from '../../../../../lib/core/database/framedSyncStagingSerialization';
import { RETIRED_SYNC_TABLES } from '../../../../../lib/core/database/retiredSyncSchema';
import { projectFramedSyncReview } from '../../../../../lib/core/sync/framedSyncRelationReviewFact';
import { COMPANION_DATABASE_VERSION } from '../../../../../lib/platform/nativeCompanionContract';
import { createFakeCapacitorConnection } from '../../companionSyncNodeVersionsTestSupport';

import {
  closeIosCompanionDatabase,
  initializeIosCompanionDatabase,
  type IosCompanionDatabaseManager
} from './iosCompanionDatabaseBootstrap';

const roots: string[] = [];
const databases: Database.Database[] = [];
afterEach(async () => {

  await closeIosCompanionDatabase();

  for (const database of databases.splice(0)) database.close();

  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });

});

describe('iOS active companion sync schema retirement', () => {
  it('retires unbacked temporary publications from v81 and reopens without changing business rows', async () => {
    const fixture = databaseFixture(false);
    await initializeIosCompanionDatabase(nativeState(), fixture.manager);
    fixture.sqlite.prepare(`INSERT INTO nodes
      (id, parent_id, kind, title, is_title_manual, hide_title_heading, content, sync_dirty,
       created_at, updated_at, deleted_at) VALUES ('kept-node', NULL, 'topic', 'Kept', 1, 0, 'Body', 0, ?, ?, NULL)`)
      .run('2026-10-05T00:00:00Z', '2026-10-05T00:00:00Z');
    const before = fixture.sqlite.prepare('SELECT * FROM nodes ORDER BY id').all();
    installUnbackedPublication(fixture.sqlite);
    fixture.sqlite.pragma('user_version = 81');
    expect(fixture.sqlite.prepare('SELECT COUNT(*) FROM review_log').pluck().get()).toBe(0);

    for (let opening = 0; opening < 2; opening += 1) {
      const state = await initializeIosCompanionDatabase(nativeState(), fixture.manager);
      expect(state.database_ready).toBe(true);
      expect(framedTables(fixture.sqlite).filter(name => new Set<string>(RETIRED_SYNC_TABLES).has(String(name)))).toEqual([]);
      expect(fixture.sqlite.pragma('user_version', { simple: true })).toBe(COMPANION_DATABASE_VERSION);
      expect(fixture.sqlite.prepare('SELECT * FROM nodes ORDER BY id').all()).toEqual(before);
      expect(fixture.sqlite.prepare('SELECT COUNT(*) FROM review_log').pluck().get()).toBe(0);
    }
  });

  it('creates a fresh database without retired transmission state', async () => {
    const fixture = databaseFixture(false);

    await initializeIosCompanionDatabase(nativeState(), fixture.manager);

    expect(framedTables(fixture.sqlite).filter(name => new Set<string>(RETIRED_SYNC_TABLES).has(String(name)))).toEqual([]);
    expect(framedTables(fixture.sqlite)).toContain('framed_sync_inventory');
    expect(fixture.sqlite.pragma('user_version', { simple: true })).toBe(COMPANION_DATABASE_VERSION);

  });

  it('upgrades a version 70 active database without losing business rows', async () => {

    const fixture = databaseFixture(true);
    fixture.sqlite.transaction(() => {
      fixture.sqlite.exec(COMPANION_SCHEMA_STATEMENTS.filter((sql) => !sql.includes('framed_sync_')).join(';\n'));

      fixture.sqlite.prepare('INSERT INTO companion_meta VALUES (?, ?, ?)')
        .run('device_id', 'ios-device', '2026-10-05T00:00:00Z');
      fixture.sqlite.prepare(`INSERT INTO nodes
        (id, parent_id, kind, title, is_title_manual, hide_title_heading, content, sync_dirty,
         created_at, updated_at, deleted_at) VALUES (?, NULL, 'topic', 'Kept', 1, 0, '', 0, ?, ?, NULL)`)
        .run('kept-node', '2026-10-05T00:00:00Z', '2026-10-05T00:00:00Z');

      fixture.sqlite.pragma('user_version = 70');
    })();

    await initializeIosCompanionDatabase(nativeState(), fixture.manager);

    expect(framedTables(fixture.sqlite).filter(name => new Set<string>(RETIRED_SYNC_TABLES).has(String(name)))).toEqual([]);
    expect(framedTables(fixture.sqlite)).toContain('framed_sync_inventory');
    expect(fixture.sqlite.prepare("SELECT title FROM nodes WHERE id = 'kept-node'").pluck().get()).toBe('Kept');
    expect(fixture.sqlite.pragma('user_version', { simple: true })).toBe(COMPANION_DATABASE_VERSION);

  });
});

function installUnbackedPublication(sqlite: Database.Database) {
  for (const sql of FRAMED_SYNC_STAGING_SCHEMA) sqlite.exec(sql);
  const fact = projectFramedSyncReview({ id: 'review', op_id: 'temporary-review', host_name: 'iPhone',
    node_id: 'kept-node', grade: 3, kind: 'review', voids_op_id: null, scheduler_version: 'v1', reviewed_at: '2026-10-01',

       });
  sqlite.prepare(`INSERT INTO framed_sync_outbound_publications
    (transfer_id, content_id, manifest_hash, canonical_manifest, manifest_json, protocol_version,
     group_id, sender_device_id, sender_library_epoch, receiver_device_id, receiver_library_epoch,
     fact_count, blob_count, total_blob_bytes, state)
    VALUES (x'01', x'02', x'03', x'04', ?, 25, 'group', 'a', 'a-epoch', 'b', 'b-epoch', 1, 0, 0, 'published')`)
    .run(encodeFramedSyncManifest({ facts: [fact], blobs: [] }));
}

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
