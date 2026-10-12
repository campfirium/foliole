import path from 'node:path';

import Database from 'better-sqlite3';

import type { DbPort } from '../../lib/core/sync/dbPort.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { createRequestSyncSnapshotDiagnostics } from './requestSyncSnapshotDiagnostics.js';
import { getSqliteConnectionCoordinator } from './sqliteConnectionCoordinator.js';

const connections = new Map<string, ReturnType<typeof openReader>>();

function openReader(databasePath: string) {
  const diagnostics = createRequestSyncSnapshotDiagnostics(databasePath);
  const openedAt = performance.now();
  let sqlite: Database.Database;
  try { sqlite = new Database(databasePath, { readonly: true, fileMustExist: true }); }
  catch (error) { diagnostics.failed(error); throw error; }
  diagnostics.opened(performance.now() - openedAt);
  try { sqlite.pragma('query_only = ON'); }
  catch (error) { diagnostics.failed(error); sqlite.close(); throw error; }
  return { sqlite, diagnostics, reader: createBetterSqliteDbPort(sqlite),
    coordinator: getSqliteConnectionCoordinator(sqlite) };
}

export function closeRequestSyncReadonlyConnections() {
  const readers = [...connections.values()];
  connections.clear();
  for (const { sqlite, diagnostics } of readers) {
    const closedAt = performance.now();
    try { if (sqlite.inTransaction) sqlite.exec('ROLLBACK'); }
    finally { sqlite.close(); diagnostics.closed(performance.now() - closedAt); }
  }
}

/** The caller releases the read transaction before starting network transmission. */
export async function withRequestSyncReadonlySnapshot<T>(databasePath: string,
  execute: (db: DbPort) => Promise<T>, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  const key = path.resolve(databasePath);
  let connection = connections.get(key);
  if (!connection) { connection = openReader(key); connections.set(key, connection); }
  const owned = connection;
  return owned.coordinator.runExclusive(async (owner, nested) => {
    if (nested) throw new Error('request_sync_snapshot_nested');
    const assertConnection = () => {
      signal?.throwIfAborted();
      if (connections.get(key) !== owned) throw new Error('request_sync_library_closed');
      owned.coordinator.assertScopedOwner(owner, true);
    };
    assertConnection();
    return readSnapshot(owned, execute, assertConnection);
  });
}

async function readSnapshot<T>(connection: ReturnType<typeof openReader>,
  execute: (db: DbPort) => Promise<T>, assertConnection: () => void) {
  const { sqlite, reader, diagnostics } = connection;
  let active = true;
  const assertActive = () => {
    assertConnection();
    if (!active) throw new Error('request_sync_snapshot_closed');
  };
  const db: DbPort = {
    async query(sql, params) {
      assertActive();
      try { return await reader.query(sql, params); }
      catch (error) { diagnostics.failed(error); throw error; }
    },
    async run() { throw new Error('request_sync_snapshot_write_forbidden'); },
    async transaction(callback) { assertActive(); return callback(db); }
  };
  try {
    diagnostics.snapshot();
    sqlite.exec('BEGIN DEFERRED');
    const result = await execute(db);
    assertActive();
    return result;
  } catch (error) {
    diagnostics.failed(error);
    throw error;
  } finally {
    active = false;
    if (sqlite.open && sqlite.inTransaction) sqlite.exec('ROLLBACK');
  }
}
