// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createCompanionDatabase, migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

it.each(['desktop', 'companion'] as const)('rolls back a failed %s upgrade without changing original data', async (host) => {
  const sqlite = new Database(':memory:');
  try {
    const db = createBetterSqliteDbPort(sqlite);
    if (host === 'desktop') initializeDatabaseSchema(sqlite);
    else await db.transaction((tx) => createCompanionDatabase(tx, COMPANION_DATABASE_VERSION));
    const oldVersion = host === 'desktop' ? 148 : 77;
    sqlite.exec(`DROP TABLE IF EXISTS framed_sync_resource_demands; PRAGMA user_version = ${oldVersion}`);
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
