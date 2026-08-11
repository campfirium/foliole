import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import {
  acknowledgeCompanionDeviceProfileReset,
  bootstrapCompanionDatabase,
  checkpointCompanionDatabase
} from '../../lib/core/database/companionDatabaseLifecycle.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

function fixture(version = COMPANION_DATABASE_VERSION) {
  const base = path.resolve('.tmp/artifacts');
  fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, 't113-lifecycle-'));
  roots.push(root);
  const databasePath = path.join(root, 'fixture.db');
  const sqlite = new Database(databasePath);
  sqlite.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  sqlite.prepare('INSERT INTO companion_meta (key, value, updated_at) VALUES (?, ?, ?)')
    .run('device_id', 'fixture-device', '2026-08-06T00:00:00Z');
  sqlite.pragma(`user_version = ${version}`);
  return { databasePath, port: createBetterSqliteDbPort(sqlite), sqlite };
}

async function bootstrap(port: ReturnType<typeof createBetterSqliteDbPort>, extra = {}) {
  return bootstrapCompanionDatabase(port, {
    allowCreate: false,
    expectedDeviceId: 'fixture-device',
    now: '2026-08-06T00:00:00Z',
    ...extra
  });
}

describe('shared companion database migration executor', () => {
  it('upgrades every supported historical version through one DbPort contract', async () => {
    for (let version = 2; version < COMPANION_DATABASE_VERSION; version += 1) {
      const { port, sqlite } = fixture(version);
      sqlite.prepare('INSERT INTO workspace_meta (key, value, updated_at) VALUES (?, ?, ?)')
        .run('fixture_version', String(version), '2026-08-06T00:00:00Z');
      await expect(bootstrap(port)).resolves.toMatchObject({ version: COMPANION_DATABASE_VERSION });
      expect(sqlite.pragma('user_version', { simple: true })).toBe(COMPANION_DATABASE_VERSION);
      expect(sqlite.prepare("SELECT value FROM workspace_meta WHERE key = 'fixture_version'").pluck().get())
        .toBe(String(version));
      sqlite.close();
    }
  });

  it('runs the legacy state-sequence command migration without losing rows', async () => {
    const { port, sqlite } = fixture(4);
    sqlite.exec('DROP TABLE sync_object_state; CREATE TABLE sync_object_state (' +
      'object_type TEXT NOT NULL, object_id TEXT NOT NULL, current_version_id TEXT, content_hash TEXT NOT NULL, ' +
      'last_modified_by_device_id TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, ' +
      'sync_dirty INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (object_type, object_id));');
    sqlite.exec("INSERT INTO sync_object_state VALUES ('node','b',NULL,'hb','d','2026-02-02',NULL,0);" +
      "INSERT INTO sync_object_state VALUES ('node','a',NULL,'ha','d','2026-01-01',NULL,1);");

    await bootstrap(port);

    expect(sqlite.prepare('SELECT object_id, state_seq FROM sync_object_state ORDER BY state_seq').all())
      .toEqual([{ object_id: 'a', state_seq: 1 }, { object_id: 'b', state_seq: 2 }]);
    sqlite.close();
  });

  it('runs attachment and external-folder command migrations on real legacy shapes', async () => {
    const first = fixture(8);
    first.sqlite.exec("INSERT INTO attachments (id,original_name,mime_type,size_bytes,created_at) VALUES " +
      "('a','a.png','image/png',1,'2026-01-01');" +
      "INSERT INTO nodes (id,title,current_version_id,created_at,updated_at) VALUES " +
      "('n','N','v','2026-01-01','2026-01-01');" +
      "INSERT INTO node_sync_versions (version_id,object_id,device_id,created_at,content_hash,snapshot_json) VALUES " +
      "('v','n','d','2026-01-01','h','{\"attachments\":[{\"attachment_id\":\"a\",\"role\":\"inline\"}]}');");
    await bootstrap(first.port);
    expect(first.sqlite.prepare('SELECT attachment_id, role FROM node_attachments').get())
      .toEqual({ attachment_id: 'a', role: 'inline' });
    first.sqlite.close();

    const second = fixture(20);
    second.sqlite.exec('DROP TABLE external_search_folders; CREATE TABLE external_search_folders (' +
      "id TEXT PRIMARY KEY, folder_path TEXT NOT NULL, attachment_mode TEXT NOT NULL, attachment_root_path TEXT, " +
      "excluded_dirs_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'idle', document_count INTEGER NOT NULL DEFAULT 0, " +
      'indexed_at TEXT, last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);' +
      "INSERT INTO external_search_folders VALUES ('f','/legacy','copy',NULL,'[]','idle',1,NULL,NULL,'c','u');");
    await bootstrap(second.port);
    expect(second.sqlite.prepare("SELECT folder_path, owner_installation_id FROM external_search_folders WHERE id = 'f'").get())
      .toEqual({ folder_path: '/legacy', owner_installation_id: null });
    second.sqlite.close();
  });
});

describe('shared companion delivery migration', () => {
  it('replaces the legacy receipt table without losing dirty facts', async () => {
    const { port, sqlite } = fixture(23);
    sqlite.exec(`
      DROP TRIGGER trg_sync_delivery_state_insert;
      DROP TRIGGER trg_sync_delivery_state_update;
      DROP TRIGGER trg_sync_delivery_member_leave;
      DROP TRIGGER trg_sync_delivery_review_insert;
      DROP TABLE sync_delivery_receipts;
      CREATE TABLE sync_push_ack (client_op_id TEXT PRIMARY KEY, status TEXT NOT NULL);
      INSERT INTO sync_groups VALUES ('group','Group','timeline','local','2026-08-01','2026-08-09');
      INSERT INTO sync_group_local_state VALUES (1,'group','local','active',NULL,NULL,'2026-08-09');
      INSERT INTO sync_group_members VALUES
        ('group','local','desktop','Local','active','local','auth-local',NULL,'2026-08-01',NULL,NULL,'2026-08-09'),
        ('group','peer','mobile','Peer','active','local','auth-peer',NULL,'2026-08-01',NULL,NULL,'2026-08-09');
      INSERT INTO sync_object_state VALUES
        ('setting','setting-a',7,NULL,'hash-a','local','2026-08-09',NULL,1,NULL);
    `);

    await bootstrap(port);

    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'sync_push_ack'").get()).toBeUndefined();
    expect(sqlite.prepare('SELECT peer_id, object_id, status FROM sync_delivery_receipts').get())
      .toEqual({ object_id: 'setting-a', peer_id: 'peer', status: 'pending' });
    expect(sqlite.prepare("SELECT content_hash FROM sync_object_state WHERE object_id = 'setting-a'").pluck().get())
      .toBe('hash-a');
    sqlite.close();
  });
});

describe('shared companion database lifecycle guardrails', () => {
  it('repairs current schema idempotently and rolls back a failed upgrade before version commit', async () => {
    const { port, sqlite } = fixture(18);
    sqlite.exec('ALTER TABLE nodes DROP COLUMN import_source_fingerprint');
    await expect(bootstrap(port, {
      beforeVersionCommit: () => { throw new Error('injected migration fault'); }
    })).rejects.toThrow('injected migration fault');
    expect(sqlite.pragma('user_version', { simple: true })).toBe(18);
    expect(sqlite.prepare("SELECT name FROM pragma_table_info('nodes') WHERE name = 'import_source_fingerprint'").get())
      .toBeUndefined();

    await bootstrap(port);
    await bootstrap(port);
    expect(sqlite.prepare("SELECT name FROM pragma_table_info('nodes') WHERE name = 'import_source_fingerprint'").pluck().get())
      .toBe('import_source_fingerprint');
    sqlite.close();
  });

  it('blocks newer versions and invalid journal modes before writes', async () => {
    const newer = fixture(COMPANION_DATABASE_VERSION + 1);
    await expect(bootstrap(newer.port)).rejects.toThrow('newer-version');
    expect(newer.sqlite.pragma('user_version', { simple: true })).toBe(COMPANION_DATABASE_VERSION + 1);
    newer.sqlite.close();

    const journal = fixture();
    journal.sqlite.pragma('journal_mode = MEMORY');
    await expect(bootstrap(journal.port)).rejects.toThrow('journal:memory');
    journal.sqlite.close();
  });
});

describe('shared companion device profile migration', () => {
  it('adopts the host profile, unbinds only local participation, and preserves history', async () => {
    const identity = fixture();
    identity.sqlite.exec(`
      INSERT INTO sync_groups VALUES ('group','Group','timeline','fixture-device','2026-08-01','2026-08-01');
      INSERT INTO sync_group_local_state VALUES (1,'group','fixture-device','active',NULL,NULL,'2026-08-01');
      INSERT INTO sync_group_members VALUES
        ('group','fixture-device','ios','Legacy','active','fixture-device','auth',NULL,'2026-08-01',NULL,NULL,'2026-08-01');
      INSERT INTO nodes (id,title,content,created_at,updated_at) VALUES
        ('node-1','Preserved','content','2026-08-01','2026-08-01');
      INSERT INTO review_log (
        id,op_id,device_id,node_id,grade,scheduler_version,reviewed_at,due_before,
        stability_before,difficulty_before,due_after,stability_after,difficulty_after
      ) VALUES ('r','op','fixture-device','node-1',3,'v1','2026-08-01','2026-08-01',1,1,'2026-08-02',2,2);
    `);

    const result = await bootstrapCompanionDatabase(identity.port, {
      allowCreate: false, expectedDeviceId: 'iPhone', now: '2026-08-11T00:00:00Z'
    });

    expect(result).toMatchObject({ credentialResetPending: true, deviceId: 'iPhone' });
    expect(identity.sqlite.prepare('SELECT COUNT(*) FROM sync_group_local_state').pluck().get()).toBe(0);
    expect(identity.sqlite.prepare('SELECT device_id, state FROM sync_group_members').get())
      .toEqual({ device_id: 'fixture-device', state: 'active' });
    expect(identity.sqlite.prepare('SELECT content FROM nodes').pluck().get()).toBe('content');
    expect(identity.sqlite.prepare('SELECT device_id FROM review_log').pluck().get()).toBe('fixture-device');

    await acknowledgeCompanionDeviceProfileReset(identity.port, 'iPhone');
    await expect(bootstrapCompanionDatabase(identity.port, {
      allowCreate: false, expectedDeviceId: 'iPhone', now: '2026-08-12T00:00:00Z'
    })).resolves.toMatchObject({ credentialResetPending: false, deviceId: 'iPhone' });
    identity.sqlite.close();
  });
});

describe('shared companion database lifecycle recovery', () => {
  it('restores a preflight-confirmed WAL contract before the migration transaction', async () => {
    const { port, sqlite } = fixture(21);
    const result = await bootstrap(port, { expectedJournalMode: 'wal' });
    expect(result.journalMode).toBe('wal');
    expect(sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
    sqlite.close();
  });

  it('checkpoints WAL and crash recovery exposes only the last committed state', async () => {
    const { databasePath, port, sqlite } = fixture();
    sqlite.pragma('journal_mode = WAL');
    sqlite.exec("CREATE TABLE lifecycle_probe (value TEXT); INSERT INTO lifecycle_probe VALUES ('committed');");
    await checkpointCompanionDatabase(port, 'wal');
    sqlite.exec("BEGIN; INSERT INTO lifecycle_probe VALUES ('uncommitted');");
    sqlite.close();

    const reopened = new Database(databasePath);
    expect(reopened.prepare('SELECT value FROM lifecycle_probe ORDER BY rowid').pluck().all()).toEqual(['committed']);
    reopened.close();
  });
});
