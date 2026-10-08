// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createCompanionDatabase, migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { ensureFramedSyncMissingResourceDemand } from '../../lib/core/sync/framedSyncResourceDemands.js';
import { clearWorkgroupSyncDataForRestore } from '../../lib/core/sync/syncGroupRestoreReset.js';
import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

const key = { groupId: 'group', receiverDeviceId: 'B', receiverLibraryEpoch: 'b',
  globalId: 'article', versionId: 'version', bodyHash: 'a'.repeat(64), storageKey: `${'b'.repeat(64)}.png` };

it.each(['fresh', 'upgrade'] as const)('installs durable resource work through desktop %s schema and clears it on overwrite', async (mode) => {
  const sqlite = new Database(':memory:');
  try {
    initializeDatabaseSchema(sqlite);
    sqlite.prepare("INSERT INTO settings VALUES ('app_settings', '{\"theme\":\"dark\"}', 'now')").run();
    if (mode === 'upgrade') {
      sqlite.exec('DROP TABLE IF EXISTS framed_sync_resource_demands; PRAGMA user_version = 148');
      initializeDatabaseSchema(sqlite);
    }
    const db = createBetterSqliteDbPort(sqlite);
    expect(await ensureFramedSyncMissingResourceDemand(db, key, () => 'demand')).toBe('demand');
    initializeDatabaseSchema(sqlite);
    expect(await ensureFramedSyncMissingResourceDemand(db, key, () => 'wrong')).toBe('demand');
    await db.transaction((tx) => clearWorkgroupSyncDataForRestore(tx, 'restored'));
    expect(sqlite.prepare('SELECT count(*) FROM framed_sync_resource_demands').pluck().get()).toBe(0);
    expect(sqlite.prepare("SELECT value FROM settings WHERE key = 'app_settings'").pluck().get())
      .toBe('{"theme":"dark"}');
  } finally { sqlite.close(); }
});

it.each(['fresh', 'upgrade'] as const)('installs the same durable work through companion %s schema', async (mode) => {
  const sqlite = new Database(':memory:');
  try {
    const db = createBetterSqliteDbPort(sqlite);
    await db.transaction((tx) => createCompanionDatabase(tx, COMPANION_DATABASE_VERSION));
    if (mode === 'upgrade') {
      sqlite.exec('DROP TABLE IF EXISTS framed_sync_resource_demands; PRAGMA user_version = 77');
      await db.transaction((tx) => migrateCompanionDatabase(tx, 77, COMPANION_DATABASE_VERSION));
    }
    expect(await ensureFramedSyncMissingResourceDemand(db, key, () => 'demand')).toBe('demand');
    expect(sqlite.pragma('user_version', { simple: true })).toBe(COMPANION_DATABASE_VERSION);
  } finally { sqlite.close(); }
});

it.each(['desktop', 'companion'] as const)('rolls back a failed %s upgrade without changing original data', async (host) => {
  const sqlite = new Database(':memory:');
  try {
    const db = createBetterSqliteDbPort(sqlite);
    if (host === 'desktop') initializeDatabaseSchema(sqlite);
    else await db.transaction((tx) => createCompanionDatabase(tx, COMPANION_DATABASE_VERSION));
    const oldVersion = host === 'desktop' ? 148 : 77;
    sqlite.exec(`DROP TABLE framed_sync_resource_demands; PRAGMA user_version = ${oldVersion}`);
    sqlite.prepare(`INSERT INTO nodes (id, title, content, created_at, updated_at)
      VALUES ('original', 'Original', 'Preserved bytes', 'now', 'now')`).run();
    const fail = () => { throw new Error('version_commit_failed'); };
    if (host === 'desktop') expect(() => initializeDatabaseSchema(sqlite, { beforeVersionCommit: fail }))
      .toThrow('version_commit_failed');
    else await expect(db.transaction((tx) => migrateCompanionDatabase(tx, oldVersion,
      COMPANION_DATABASE_VERSION, fail))).rejects.toThrow('version_commit_failed');
    expect(sqlite.pragma('user_version', { simple: true })).toBe(oldVersion);
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'framed_sync_resource_demands'").get())
      .toBeUndefined();
    expect(sqlite.prepare("SELECT title, content FROM nodes WHERE id = 'original'").get())
      .toEqual({ title: 'Original', content: 'Preserved bytes' });
  } finally { sqlite.close(); }
});
