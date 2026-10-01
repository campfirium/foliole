// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

const now = '2026-09-30T00:00:00.000Z';
const request = { allowCreate: false, expectedHostName: 'Mobile', now };

it('upgrades the previous mobile library and retains pending restore state across two cold opens', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-restore-upgrade-'));
  const databasePath = path.join(root, 'library.db');
  let db = previousLibrary(databasePath);
  try {
    for (let restart = 0; restart < 2; restart++) {
      db.close();
      db = new Database(databasePath);
      const result = await bootstrapCompanionDatabase(createBetterSqliteDbPort(db), request);
      expect(result).toMatchObject({ created: false, deviceId: 'mobile-id', version: COMPANION_DATABASE_VERSION });
      expect(db.pragma('user_version', { simple: true })).toBe(COMPANION_DATABASE_VERSION);
      expect(db.prepare('SELECT id, content FROM nodes').all()).toEqual([{ id: 'old', content: 'Protected body' }]);
      expect(db.prepare('SELECT workgroup_key FROM sync_groups').get()).toEqual({ workgroup_key: 'protected-key' });
      expect(db.prepare('SELECT restore_id, applied_at FROM sync_group_restore_events').get())
        .toEqual({ restore_id: 'pending', applied_at: null });
      expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'attachment_receive_checkpoints'").get())
        .toEqual({ name: 'attachment_receive_checkpoints' });
    }
  } finally { db.close(); fs.rmSync(root, { recursive: true, force: true }); }
});

it('rolls back a failed upgrade and leaves the prior library ready for a clean restart', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-restore-upgrade-failure-'));
  const db = previousLibrary(path.join(root, 'library.db'));
  try {
    await expect(bootstrapCompanionDatabase(createBetterSqliteDbPort(db), {
      ...request, beforeVersionCommit: () => { throw new Error('upgrade interrupted'); }
    })).rejects.toThrow('upgrade interrupted');
    expect(db.pragma('user_version', { simple: true })).toBe(54);
    expect(db.prepare('SELECT content FROM nodes').get()).toEqual({ content: 'Protected body' });
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'attachment_receive_checkpoints'").get()).toBeUndefined();
  } finally { db.close(); fs.rmSync(root, { recursive: true, force: true }); }
});

function previousLibrary(databasePath: string) {
  const db = new Database(databasePath);
  db.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  db.exec(`DROP TABLE attachment_receive_checkpoints; PRAGMA user_version = 54;
    INSERT INTO companion_meta VALUES ('device_id', 'mobile-id', '${now}');
    INSERT INTO companion_meta VALUES ('host_name', 'Mobile', '${now}');
    INSERT INTO sync_groups VALUES ('group', 'Group', 'protected-key', '${now}', '${now}');
    INSERT INTO sync_group_local_state VALUES (1, 'group', 'mobile-id', 'active', '${now}');
    INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
      VALUES ('old', 'topic', 'Old', 'Protected body', '${now}', '${now}');
    INSERT INTO sync_group_restore_events VALUES ('pending', 'group', '${now}', 'source', NULL, '${now}');`);
  return db;
}
