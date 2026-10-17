// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { migrateCompanionDatabase, createCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { readRequestSyncAttachmentNeedsSlice } from '../../lib/core/sync/requestSyncAttachmentNeeds.js';
import { clearWorkgroupSyncDataForRestore } from '../../lib/core/sync/syncGroupRestoreReset.js';
import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract.js';
import { demandFixture, imageBody, imageKey } from '../sync/attachmentDemandQueue.testSupport.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

it.each(['desktop', 'companion'])('seeds existing live articles once at upgrade and clears obsolete demand on reset: %s', async platform => {
  const sqlite = new Database(':memory:');
  const db = createBetterSqliteDbPort(sqlite);
  const host = { readSnapshot: <T>(read: (port: typeof db) => Promise<T>) => db.transaction(read),
    write: <T>(write: (port: typeof db) => Promise<T>) => write(db) };
  try {
    if (platform === 'desktop') initializeDatabaseSchema(sqlite);
    else await db.transaction(tx => createCompanionDatabase(tx, COMPANION_DATABASE_VERSION));
    sqlite.prepare(`INSERT INTO nodes(id, kind, title, content, created_at, updated_at) VALUES ('old', 'topic', '', ?, 'now', 'now')`)
      .run(imageBody(imageKey(1)));
    sqlite.exec(`DROP TRIGGER attachment_demand_insert; DROP TRIGGER attachment_demand_update; DROP TRIGGER attachment_demand_delete;
      DROP TABLE attachment_parse_queue; DROP TABLE attachment_pending`);
    if (platform === 'desktop') {
      sqlite.pragma(`user_version = ${DATABASE_SCHEMA_VERSION - 1}`); initializeDatabaseSchema(sqlite);
    } else await db.transaction(tx => migrateCompanionDatabase(tx, COMPANION_DATABASE_VERSION - 1, COMPANION_DATABASE_VERSION));
    expect((await readRequestSyncAttachmentNeedsSlice(host, async keys => keys.map(() => false), () => false)).keys).toEqual([imageKey(1)]);
    await db.transaction(tx => clearWorkgroupSyncDataForRestore(tx, 'restore'));
    await readRequestSyncAttachmentNeedsSlice(host, async keys => keys.map(() => false), () => false);
    expect(sqlite.prepare('SELECT * FROM attachment_pending').all()).toEqual([]);
    sqlite.prepare(`INSERT INTO nodes(id, kind, title, content, created_at, updated_at) VALUES ('replacement', 'topic', '', ?, 'now', 'now')`)
      .run(imageBody(imageKey(2)));
    expect((await readRequestSyncAttachmentNeedsSlice(host, async keys => keys.map(() => false), () => false)).keys).toEqual([imageKey(2)]);
    expect(sqlite.pragma('user_version', { simple: true })).toBe(platform === 'desktop' ? DATABASE_SCHEMA_VERSION : COMPANION_DATABASE_VERSION);
  } finally { sqlite.close(); }
});

it('rolls back demand registration with the originating write', async () => {
  const f = demandFixture();
  try {
    await expect(f.port.transaction(async tx => {
      await tx.run('INSERT INTO nodes(id, content) VALUES (?, ?)', ['failed', imageBody(imageKey(1))]);
      throw new Error('interrupted');
    })).rejects.toThrow('interrupted');
    expect(f.queued()).toEqual([]);
  } finally { f.sqlite.close(); }
});
