import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { CompanionDatabaseBlockedError } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { prepareCompanionRestoreCandidate } from '../../lib/core/database/companionRestoreCandidate.js';
import { readRestoreCarriedMeta } from '../../lib/core/database/companionRestoreIdentity.js';
import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract.js';
import { V082_IMAGE_A, V082_IMAGE_B, writeV082Backup } from '../../src/shared/platform/companion/backupRestore/companionV082Backup.testSupport.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

const IMAGE_A = V082_IMAGE_A;
const IMAGE_B = V082_IMAGE_B;
const NOW = '2026-11-21T00:00:00Z';
const roots: string[] = [];
const databases: { close(): unknown; open: boolean }[] = [];
afterEach(() => {
  // Windows cannot remove a database file this process still holds open.
  for (const database of databases.splice(0)) if (database.open) database.close();
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

function directory() {
  const base = path.resolve('.tmp/artifacts');
  fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, 't832-restore-'));
  roots.push(root);
  return root;
}

function v082Backup() {
  const sqlite = writeV082Backup(path.join(directory(), 'Foliole.sqlite'));
  databases.push(sqlite);
  return { port: createBetterSqliteDbPort(sqlite), sqlite };
}

function prepare(port: ReturnType<typeof v082Backup>['port'], stagedStorageKeys = [IMAGE_A]) {
  return prepareCompanionRestoreCandidate(port, {
    carriedMeta: { workspace_sync_onboarding_status: 'dismissed' },
    deviceId: 'Spare Phone', hostName: 'Spare Phone', now: NOW, stagedStorageKeys
  });
}

const values = (sqlite: Database.Database, sql: string) => sqlite.prepare(sql).raw().all();

describe('restore candidate from an Android v0.8.2 folder backup', () => {
  it('migrates the backup and adopts this device as an offline library', async () => {
    const { port, sqlite } = v082Backup();
    const summary = await prepare(port);

    expect(summary).toEqual({ backupHostName: 'Main Phone', backupVersion: 117, entryCount: 1,
      lastModifiedAt: '2026-10-02T00:00:00Z', stagedAttachmentCount: 1, missingAttachmentCount: 1, unreadableEntryCount: 0 });
    expect(sqlite.pragma('user_version', { simple: true })).toBe(COMPANION_DATABASE_VERSION);
    expect(values(sqlite, "SELECT key, value FROM companion_meta WHERE key IN ('device_id', 'host_name') ORDER BY key"))
      .toEqual([['device_id', 'Spare Phone'], ['host_name', 'Spare Phone']]);
    expect(values(sqlite, 'SELECT host_name, reading_position FROM node_reading_host_state')).toEqual([['Spare Phone', 42]]);
    for (const table of ['sync_groups', 'sync_group_devices', 'sync_group_local_state']) {
      expect(values(sqlite, `SELECT COUNT(*) FROM ${table}`)).toEqual([[0]]);
    }
    expect(await readRestoreCarriedMeta(port)).toEqual({ workspace_sync_onboarding_status: 'dismissed' });
    expect(values(sqlite, `SELECT key FROM companion_meta WHERE key LIKE 'folder_%' OR key LIKE 'sync_%_cursor'`)).toEqual([]);
    expect(values(sqlite, "SELECT title FROM nodes WHERE id = 'topic-1'")).toEqual([['Images']]);
    expect(values(sqlite, 'PRAGMA quick_check')).toEqual([['ok']]);
  });

  it('gives the restored library a new sync source so it cannot pose as the backup device', async () => {
    const { port, sqlite } = v082Backup();
    const [before] = values(sqlite, 'SELECT source_epoch FROM sync_state_sequence');
    await prepare(port, [IMAGE_A, IMAGE_B]);
    expect(values(sqlite, 'SELECT source_epoch FROM sync_state_sequence')).not.toEqual([before]);
  });
});

describe('restore candidate rejection', () => {
  it('rejects a backup from a newer Foliole', async () => {
    const { port, sqlite } = v082Backup();
    sqlite.pragma(`user_version = ${COMPANION_DATABASE_VERSION + 1}`);
    await expect(prepare(port)).rejects.toMatchObject({ reason: 'newer-version' });
  });

  it('rejects a database that is not a Foliole library', async () => {
    const sqlite = new Database(path.join(directory(), 'Foliole.sqlite'));
    const port = createBetterSqliteDbPort(sqlite);
    sqlite.exec('CREATE TABLE unrelated (id INTEGER)');
    await expect(prepare(port)).rejects.toBeInstanceOf(CompanionDatabaseBlockedError);
    expect(values(sqlite, "SELECT name FROM sqlite_master WHERE name = 'companion_meta'")).toEqual([]);
  });
});
