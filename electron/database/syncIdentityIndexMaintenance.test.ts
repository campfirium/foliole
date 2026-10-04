import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { SYNC_IDENTITY_INDEX_SCHEMA_STATEMENTS } from '../../lib/core/database/syncIdentityIndexSchemaStatements.js';
import { syncIdentityPartition } from '../../lib/core/sync/syncIdentityDigest.js';
import { readReadySyncIdentityGlobalPage,
  readReadySyncIdentityInventory } from '../../lib/core/sync/syncIdentityGlobalRead.js';
import {
  backfillSyncIdentityIndexPage, drainSyncIdentityDirtyPage,
  readReadySyncIdentityPage, readReadySyncIdentitySummary, refreshSyncIdentityDigest
} from '../../lib/core/sync/syncIdentityIndexMaintenance.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

it('resumes bounded identity backfill and incorporates writes made between pages', async () => {
  const sqlite = new Database(':memory:');
  try {
    sqlite.exec(`CREATE TABLE sync_object_state (
      object_type TEXT NOT NULL, object_id TEXT NOT NULL, state_seq INTEGER NOT NULL UNIQUE,
      current_version_id TEXT, content_hash TEXT NOT NULL, updated_at TEXT NOT NULL,
      deleted_at TEXT, PRIMARY KEY (object_type, object_id)
    )`);
    for (const statement of SYNC_IDENTITY_INDEX_SCHEMA_STATEMENTS) sqlite.exec(statement);
    sqlite.exec(`INSERT INTO sync_object_state VALUES
      ('node', 'a', 1, 'v1', 'h1', 't1', NULL),
      ('node', 'b', 2, 'v2', 'h2', 't2', NULL),
      ('node', 'c', 3, 'v3', 'h3', 't3', NULL)`);
    const port = createBetterSqliteDbPort(sqlite);
    const eligible = async () => true;
    expect(await backfillSyncIdentityIndexPage(port, eligible, 2)).toEqual({ complete: false, processed: 2 });
    sqlite.exec(`UPDATE sync_object_state SET content_hash = 'h1-new' WHERE object_id = 'a'`);
    sqlite.exec(`DELETE FROM sync_object_state WHERE object_id = 'b'`);
    expect(await backfillSyncIdentityIndexPage(port, eligible, 2)).toEqual({ complete: true, processed: 1 });
    await expect(readReadySyncIdentitySummary(port)).rejects.toThrow('sync_identity_index_not_ready');
    while (await drainSyncIdentityDirtyPage(port, eligible, 2)) { /* bounded drain */ }
    expect(sqlite.prepare(`SELECT object_id, content_hash FROM sync_object_state
      ORDER BY object_id`).all()).toEqual([
      { object_id: 'a', content_hash: 'h1-new' }, { object_id: 'c', content_hash: 'h3' }
    ]);
    expect(sqlite.prepare(`SELECT object_id FROM sync_identity_index_rows ORDER BY object_id`).all())
      .toEqual([{ object_id: 'a' }, { object_id: 'c' }]);
    while (await refreshSyncIdentityDigest(port, 1)) { /* fixed partition set */ }
    const summary = await readReadySyncIdentitySummary(port);
    expect(summary).toHaveLength(256);
    expect(summary.reduce((count, item) => count + item.row_count, 0)).toBe(2);
    sqlite.exec(`UPDATE sync_object_state SET current_version_id = 'v4' WHERE object_id = 'a'`);
    await expect(readReadySyncIdentitySummary(port)).rejects.toThrow('sync_identity_index_not_ready');
  } finally {
    sqlite.close();
  }
});

it('serves a differing partition in stable pages with row and byte caps', async () => {
  const sqlite = new Database(':memory:');
  try {
    sqlite.exec(`CREATE TABLE sync_object_state (
      object_type TEXT NOT NULL, object_id TEXT NOT NULL, state_seq INTEGER NOT NULL UNIQUE,
      current_version_id TEXT, content_hash TEXT NOT NULL, updated_at TEXT NOT NULL,
      deleted_at TEXT, PRIMARY KEY (object_type, object_id)
    )`);
    for (const statement of SYNC_IDENTITY_INDEX_SCHEMA_STATEMENTS) sqlite.exec(statement);
    const partition = syncIdentityPartition('node', 'a');
    const ids = ['a'];
    for (let index = 0; ids.length < 3; index += 1) {
      const id = `candidate-${index}`;
      if (syncIdentityPartition('node', id) === partition) ids.push(id);
    }
    const insert = sqlite.prepare(`INSERT INTO sync_object_state VALUES
      ('node', ?, ?, 'version', 'hash', 'time', NULL)`);
    ids.forEach((id, index) => insert.run(id, index + 1));
    const port = createBetterSqliteDbPort(sqlite);
    while (!(await backfillSyncIdentityIndexPage(port, async () => true, 2)).complete) { /* next page */ }
    while (await drainSyncIdentityDirtyPage(port, async () => true, 2)) { /* bounded drain */ }
    while (await refreshSyncIdentityDigest(port, 1)) { /* fixed partition set */ }
    const first = await readReadySyncIdentityPage(port, partition, null, 2);
    expect(first.entries).toHaveLength(2);
    expect(first.nextAfter).toEqual({ object_type: first.entries[1]!.object_type,
      object_id: first.entries[1]!.object_id });
    const second = await readReadySyncIdentityPage(port, partition, first.nextAfter, 2);
    expect(second.entries).toHaveLength(1);
    expect(second.nextAfter).toBeNull();
    const byteCapped = await readReadySyncIdentityPage(port, partition, null, 3, 256);
    expect(byteCapped.entries).toHaveLength(1);
    expect(byteCapped.nextAfter).not.toBeNull();
  } finally {
    sqlite.close();
  }
});

it('scans Unicode identity keys in SQLite BINARY order', async () => {
  const sqlite = new Database(':memory:');
  try {
    sqlite.exec(`CREATE TABLE sync_object_state (
      object_type TEXT NOT NULL, object_id TEXT NOT NULL, state_seq INTEGER NOT NULL UNIQUE,
      current_version_id TEXT, content_hash TEXT NOT NULL, updated_at TEXT NOT NULL,
      deleted_at TEXT, PRIMARY KEY (object_type, object_id)
    )`);
    for (const statement of SYNC_IDENTITY_INDEX_SCHEMA_STATEMENTS) sqlite.exec(statement);
    const insert = sqlite.prepare(`INSERT INTO sync_object_state VALUES
      ('node', ?, ?, NULL, 'content', 'now', NULL)`);
    insert.run('😀', 1);
    insert.run('\ue000', 2);
    const port = createBetterSqliteDbPort(sqlite);
    while (!(await backfillSyncIdentityIndexPage(port, async () => true)).complete) { /* page */ }
    while (await drainSyncIdentityDirtyPage(port, async () => true)) { /* page */ }
    while (await refreshSyncIdentityDigest(port)) { /* partition */ }
    expect((await readReadySyncIdentityGlobalPage(port, null)).entries.map((row) => row.object_id))
      .toEqual(['\ue000', '😀']);
    expect((await readReadySyncIdentityInventory(port)).row_count).toBe(2);
  } finally { sqlite.close(); }
});
