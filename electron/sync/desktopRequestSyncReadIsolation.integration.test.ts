// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let stateRoot = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({ app_cache_dir: path.join(stateRoot, 'cache'),
    app_config_dir: path.join(stateRoot, 'config'), app_data_dir: stateRoot,
    app_log_dir: path.join(stateRoot, 'logs') })
}));

import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { respondRequestSyncDatabase } from '../../lib/core/sync/requestSyncDatabaseResponse.js';
import { iterateRequestSyncInventory, decodeRequestSyncInventory } from '../../lib/core/sync/requestSyncInventoryWire.js';
import { prepareRequestSyncWire, readRequestSyncWire } from '../../lib/core/sync/requestSyncWire.js';
import { beginSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionMaintenance, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { flushDirtyNodeSyncVersions } from '../database/nodeSyncVersions.js';

import { createDesktopRequestSyncDatabaseHost } from './desktopRequestSyncDatabaseHost.js';

it.each([false, true])('reports owner waiting separately from completed work, rollback=%s', async rollback => {
  const connection = openDatabaseConnection();
  const events: { phase: string; durationMs: number }[] = [];
  const host = createDesktopRequestSyncDatabaseHost(connection.dbPath, undefined, undefined,
    (phase, durationMs) => events.push({ phase, durationMs }));
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const owner = runWithDatabaseConnectionOwner(async () => { entered(); await waiting; });
  await started;
  let now = 100;
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
  const work = host.write(async db => {
    await db.run("UPDATE nodes SET priority = 3 WHERE id = 'special-inbox'");
    now = 500;
    if (rollback) throw new Error('timed_write_failed');
  });
  expect(events).toEqual([]);
  now = 200;
  release();
  await owner;
  if (rollback) await expect(work).rejects.toThrow('timed_write_failed');
  else await work;
  clock.mockRestore();
  expect(events).toEqual([{ phase: 'write_owner_wait', durationMs: 100 },
    { phase: 'write_owner_held', durationMs: 300 }]);
  expect(connection.sqlite.prepare("SELECT priority FROM nodes WHERE id = 'special-inbox'").pluck().get())
    .toBe(rollback ? null : 3);
});

it.each([
  { searchWriter: false, dirty: false },
  { searchWriter: true, dirty: false },
  { searchWriter: true, dirty: true }
])('answers an inventory request with search writer=$searchWriter and dirty node=$dirty', async ({ searchWriter, dirty }) => {
  const connection = openDatabaseConnection();
  connection.sqlite.pragma('busy_timeout = 0');
  const search = new Database(connection.searchDbPath);
  const host = createDesktopRequestSyncDatabaseHost(connection.dbPath);
  if (dirty) connection.driver.execute("UPDATE nodes SET priority = 3, sync_dirty = 1 WHERE id = 'special-inbox'");
  const input = { context: { groupId: 'diagnostic', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    initiatorDeviceId: 'phone', initiatorLibraryEpoch: 'phone-epoch',
    responderDeviceId: 'desktop', responderLibraryEpoch: 'desktop-epoch' } as const, groupKey: new Uint8Array(32).fill(7) };
  const request = await prepareRequestSyncWire({ ...input, messages: async function* () {
    yield* iterateRequestSyncInventory({ entries: [], roundId: new Uint8Array(16).fill(1), bucketSummary: true });
  } });
  try {
    if (searchWriter) search.exec('BEGIN IMMEDIATE');
    const result = await respondRequestSyncDatabase(host, { ...input, stream: request, mode: 'inventory' }, async response => {
      return decodeRequestSyncInventory((async function* () {
        for await (const decoded of readRequestSyncWire({ ...input, ...response })) yield decoded.message;
      })());
    });
    expect(result.bucketSummary).toBe(true);
    expect(connection.sqlite.prepare("SELECT sync_dirty FROM nodes WHERE id = 'special-inbox'").pluck().get()).toBe(0);
    expect(search.inTransaction).toBe(searchWriter);
  } finally {
    await request.frames.return(undefined);
    if (search.inTransaction) search.exec('ROLLBACK');
    search.close();
  }
});

it.each([false, true])('keeps sync writes atomic beside the search writer, rollback=%s', async rollback => {
  const connection = openDatabaseConnection();
  connection.sqlite.pragma('busy_timeout = 0');
  const search = new Database(connection.searchDbPath);
  const host = createDesktopRequestSyncDatabaseHost(connection.dbPath);
  try {
    search.exec('BEGIN IMMEDIATE');
    const work = host.write(async db => {
      await db.run("UPDATE nodes SET priority = 3, sync_dirty = 1 WHERE id = 'special-inbox'");
      if (rollback) throw new Error('reject_sync_write');
    });
    if (rollback) await expect(work).rejects.toThrow('reject_sync_write');
    else await work;
    expect(connection.sqlite.prepare("SELECT priority FROM nodes WHERE id = 'special-inbox'").pluck().get())
      .toBe(rollback ? null : 3);
    expect(connection.sqlite.inTransaction).toBe(false);
    expect(search.inTransaction).toBe(true);
  } finally {
    if (search.inTransaction) search.exec('ROLLBACK');
    search.close();
  }
});

beforeEach(async () => {
  stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-read-isolation-'));
  initializeDatabase();
  flushDirtyNodeSyncVersions();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(stateRoot, { recursive: true, force: true });
});

it('reads prepared sync data while the independent search database has an active writer', async () => {
  const connection = openDatabaseConnection();
  connection.sqlite.pragma('busy_timeout = 0');
  const search = new Database(connection.searchDbPath);
  try {
    search.exec('BEGIN IMMEDIATE');
    const host = createDesktopRequestSyncDatabaseHost(connection.dbPath);
    await expect(host.readSnapshot(db => db.query('SELECT id FROM nodes WHERE id = ?', ['special-inbox'])))
      .resolves.toEqual([{ id: 'special-inbox' }]);
    expect(search.inTransaction).toBe(true);
  } finally {
    if (search.inTransaction) search.exec('ROLLBACK');
    search.close();
  }
});

it.each(['dirty-version', 'missing-state', 'unversioned'] as const)('prepares %s before publishing the read snapshot', async (kind) => {
  const connection = openDatabaseConnection();
  if (kind === 'dirty-version') {
    connection.driver.execute("UPDATE nodes SET priority = 3, sync_dirty = 1 WHERE id = 'special-inbox'");
  } else if (kind === 'missing-state') {
    connection.driver.execute("DELETE FROM sync_object_state WHERE object_type = 'node' AND object_id = 'special-inbox'");
  } else {
    connection.driver.execute("UPDATE nodes SET current_version_id = NULL, sync_dirty = 0 WHERE id = 'special-inbox'");
  }
  const host = createDesktopRequestSyncDatabaseHost(connection.dbPath);
  const rows = await host.readSnapshot(db => db.query(`SELECT n.sync_dirty,
    json_extract(v.snapshot_json, '$.priority') AS priority
    FROM nodes n JOIN sync_object_state s ON s.object_type = 'node' AND s.object_id = n.id
    JOIN node_sync_versions v ON v.version_id = s.current_version_id WHERE n.id = ?`, ['special-inbox']));
  expect(rows).toEqual([{ sync_dirty: 0, priority: kind === 'dirty-version' ? 3 : null }]);
});

it('keeps unpublished versions pending while library adoption blocks publication', async () => {
  const connection = openDatabaseConnection();
  await beginSyncGroupLocalAdoption(createBetterSqliteDbPort(connection.sqlite), {
    endpointUrl: 'http://127.0.0.1:38641', groupId: 'adopting-group', libraryEpoch: 'incoming-epoch',
    providerDeviceId: 'provider', providerDeviceName: 'Provider', providerPlatform: 'macos'
  });
  connection.driver.execute("UPDATE nodes SET priority = 3, sync_dirty = 1 WHERE id = 'special-inbox'");
  const host = createDesktopRequestSyncDatabaseHost(connection.dbPath);
  const rows = await host.readSnapshot(db => db.query(`SELECT n.sync_dirty,
    json_extract(v.snapshot_json, '$.priority') AS priority FROM nodes n
    JOIN node_sync_versions v ON v.version_id = n.current_version_id WHERE n.id = ?`, ['special-inbox']));
  expect(rows).toEqual([{ sync_dirty: 1, priority: null }]);
});

it('rejects a queued preparation write after closing and reopening the same library path', async () => {
  const { parseChangedAttachmentArticles } = await import('../../lib/core/sync/attachmentDemandPreparation.js');
  const connection = openDatabaseConnection();
  const host = createDesktopRequestSyncDatabaseHost(connection.dbPath);
  const article = 'special-inbox';
  await host.write(db => db.run('UPDATE nodes SET content = ? WHERE id = ?',
    [`![image](asset://${'a'.repeat(64)}.png)`, article]));
  let closed = false;
  const prepared = { ...host, write: async <T>(write: (db: import('../../lib/core/sync/dbPort.js').DbPort) => Promise<T>) => {
    if (!closed) {
      closed = true;
      await runWithDatabaseConnectionMaintenance(() => {
        closeDatabaseConnection();
        expect(openDatabaseConnection().dbPath).toBe(connection.dbPath);
      });
    }
    return host.write(write);
  } };
  await expect(parseChangedAttachmentArticles(prepared, () => false, [article])).rejects.toThrow('request_sync_library_changed');
  const current = createDesktopRequestSyncDatabaseHost(connection.dbPath);
  expect(await current.readSnapshot(db => db.query('SELECT article_id FROM attachment_parse_queue WHERE article_id = ?', [article])))
    .toEqual([{ article_id: article }]);
  expect(await current.readSnapshot(db => db.query('SELECT * FROM attachment_pending WHERE article_id = ?', [article]))).toEqual([]);
});

it('revalidates a preparation only after its queued writer actually acquires ownership', async () => {
  const { parseChangedAttachmentArticles } = await import('../../lib/core/sync/attachmentDemandPreparation.js');
  const connection = openDatabaseConnection();
  const host = createDesktopRequestSyncDatabaseHost(connection.dbPath);
  await host.write(db => db.run('UPDATE nodes SET content = ? WHERE id = ?',
    [`![old](asset://${'a'.repeat(64)}.png)`, 'special-inbox']));
  const prepared = { ...host, write: async <T>(write: (db: import('../../lib/core/sync/dbPort.js').DbPort) => Promise<T>) => {
    let release!: () => void;
    let entered!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const acquired = new Promise<void>(resolve => { entered = resolve; });
    const editing = runWithDatabaseConnectionOwner(async () => {
      entered(); await blocked;
      connection.driver.execute('UPDATE nodes SET content = ? WHERE id = ?',
        [`![new](asset://${'b'.repeat(64)}.png)`, 'special-inbox']);
    });
    await acquired;
    const queued = host.write(write);
    release(); await editing;
    return queued;
  } };
  await parseChangedAttachmentArticles(prepared, () => false, ['special-inbox']);
  expect(await host.readSnapshot(db => db.query("SELECT * FROM attachment_pending WHERE article_id = 'special-inbox'"))).toEqual([]);
  expect(await host.readSnapshot(db => db.query("SELECT article_id FROM attachment_parse_queue WHERE article_id = 'special-inbox'")))
    .toEqual([{ article_id: 'special-inbox' }]);
});
