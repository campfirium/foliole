// @vitest-environment node
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { COMPANION_DATABASE_VERSION } from '../../platform/nativeCompanionContract.js';

import { createCompanionDatabase, migrateCompanionDatabase } from './companionDatabaseMigrationExecutor.js';

it('upgrades an existing companion atomically without changing original attachment demand or content', async () => {
  await mkdir(path.resolve('.tmp/artifacts/T692'), { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/artifacts/T692/work-migration-'));
  const databasePath = path.join(root, 'source.sqlite');
  let sqlite = new Database(databasePath);
  let db = createBetterSqliteDbPort(sqlite);
  try {
    await db.transaction(tx => createCompanionDatabase(tx, COMPANION_DATABASE_VERSION));
    sqlite.prepare('INSERT INTO nodes(id,title,content,created_at,updated_at) VALUES (?,?,?,?,?)')
      .run('original', 'Preserved', '![image](asset://original.png)', 'now', 'now');
    const original = sqlite.prepare('SELECT * FROM nodes').all();
    const demands = sqlite.prepare('SELECT * FROM attachment_parse_queue').all();
    sqlite.exec('DROP TABLE folder_attachment_work; PRAGMA user_version=111');
    await expect(db.transaction(tx => migrateCompanionDatabase(tx, 111, COMPANION_DATABASE_VERSION,
      () => { throw new Error('interrupted upgrade'); }))).rejects.toThrow('interrupted upgrade');
    expect(sqlite.pragma('user_version', { simple: true })).toBe(111);
    expect(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE name='folder_attachment_work'").get()).toBeUndefined();
    expect(sqlite.prepare('SELECT * FROM nodes').all()).toEqual(original);
    await db.transaction(tx => migrateCompanionDatabase(tx, 111, COMPANION_DATABASE_VERSION));
    sqlite.close(); sqlite = new Database(databasePath); db = createBetterSqliteDbPort(sqlite);
    expect(sqlite.pragma('user_version', { simple: true })).toBe(COMPANION_DATABASE_VERSION);
    expect(await db.query('SELECT * FROM folder_attachment_work')).toEqual([]);
    expect(sqlite.prepare('SELECT * FROM nodes').all()).toEqual(original);
    expect(sqlite.prepare('SELECT * FROM attachment_parse_queue').all()).toEqual(demands);
  } finally { if (sqlite.open) sqlite.close(); await rm(root, { recursive: true, force: true }); }
});
