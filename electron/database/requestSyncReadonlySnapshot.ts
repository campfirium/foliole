import Database from 'better-sqlite3';

import type { DbPort } from '../../lib/core/sync/dbPort.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

/** The caller releases the read transaction before starting network transmission. */
export async function withRequestSyncReadonlySnapshot<T>(databasePath: string,
  execute: (db: DbPort) => Promise<T>, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  const sqlite = new Database(databasePath, { readonly: true, fileMustExist: true });
  const reader = createBetterSqliteDbPort(sqlite);
  let active = true;
  const assertActive = () => {
    signal?.throwIfAborted();
    if (!active) throw new Error('request_sync_snapshot_closed');
  };
  const db: DbPort = {
    async query(sql, params) { assertActive(); return reader.query(sql, params); },
    async run() { throw new Error('request_sync_snapshot_write_forbidden'); },
    async transaction(callback) { assertActive(); return callback(db); }
  };
  try {
    sqlite.pragma('query_only = ON');
    sqlite.exec('BEGIN DEFERRED');
    const result = await execute(db);
    assertActive();
    return result;
  } finally {
    active = false;
    try { if (sqlite.inTransaction) sqlite.exec('ROLLBACK'); }
    finally { sqlite.close(); }
  }
}
