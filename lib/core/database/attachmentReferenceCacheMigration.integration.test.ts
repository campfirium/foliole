// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { COMPANION_DATABASE_VERSION } from '../../platform/nativeCompanionContract.js';
import { readRequestSyncAttachmentNeedsSlice } from '../sync/requestSyncAttachmentNeeds.js';

import { createCompanionDatabase, migrateCompanionDatabase } from './companionDatabaseMigrationExecutor.js';
import { initializeDatabaseSchema, DATABASE_SCHEMA_VERSION } from './migrations.js';
import { hashTextBody } from './textBodyHash.js';

it.each(['desktop', 'companion'])('upgrades legacy bodies atomically and retains sync demand after reopen: %s', async host => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-migration-'));
  const databasePath = path.join(root, 'library.db');
  let sqlite = new Database(databasePath);
  let db = createBetterSqliteDbPort(sqlite);
  const key = `${'a'.repeat(64)}.png`;
  const content = `![image](asset://${key})`;
  try {
    if (host === 'desktop') initializeDatabaseSchema(sqlite);
    else await db.transaction(tx => createCompanionDatabase(tx, COMPANION_DATABASE_VERSION));
    sqlite.prepare(`INSERT INTO nodes(id,title,content,body_blob_hash,sync_dirty,created_at,updated_at)
      VALUES ('legacy','Original',?,NULL,0,'2000','2000')`).run(content);
    sqlite.exec(`DROP TABLE attachment_reference_cache; DELETE FROM attachment_parse_queue`);
    const oldVersion = host === 'desktop' ? 179 : 107;
    sqlite.pragma(`user_version = ${oldVersion}`);
    const before = sqlite.prepare('SELECT * FROM nodes').all();
    const versions = sqlite.prepare('SELECT * FROM node_sync_versions').all();
    const upgrade = async (beforeVersionCommit?: () => void) => {
      if (host === 'desktop') initializeDatabaseSchema(sqlite, beforeVersionCommit ? { beforeVersionCommit } : {});
      else await db.transaction(tx => migrateCompanionDatabase(tx, oldVersion, COMPANION_DATABASE_VERSION, beforeVersionCommit));
    };
    await expect(upgrade(() => { throw new Error('interrupted'); })).rejects.toThrow('interrupted');
    expect(sqlite.pragma('user_version', { simple: true })).toBe(oldVersion);
    expect(sqlite.prepare('SELECT * FROM nodes').all()).toEqual(before);
    expect(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE name='attachment_reference_cache'").get()).toBeUndefined();
    await upgrade();
    const after = sqlite.prepare('SELECT * FROM nodes').all();
    expect(after).toEqual(before.map(row => ({ ...(row as object), body_blob_hash: hashTextBody(content) })));
    expect(sqlite.prepare('SELECT * FROM node_sync_versions').all()).toEqual(versions);
    expect(sqlite.prepare('SELECT * FROM attachment_reference_cache').all()).toEqual([]);
    expect(sqlite.prepare('SELECT article_id FROM attachment_parse_queue').pluck().all()).toEqual(['legacy']);
    expect(sqlite.pragma('user_version', { simple: true })).toBe(host === 'desktop' ? DATABASE_SCHEMA_VERSION : COMPANION_DATABASE_VERSION);
    sqlite.close(); sqlite = new Database(databasePath); db = createBetterSqliteDbPort(sqlite);
    const syncHost = { readSnapshot: <T>(read: (tx: typeof db) => Promise<T>) => db.transaction(read),
      write: <T>(write: (tx: typeof db) => Promise<T>) => db.transaction(write) };
    expect((await readRequestSyncAttachmentNeedsSlice(syncHost, async keys => keys.map(() => false), () => false)).keys).toEqual([key]);
  } finally { sqlite.close(); fs.rmSync(root, { recursive: true, force: true }); }
});
