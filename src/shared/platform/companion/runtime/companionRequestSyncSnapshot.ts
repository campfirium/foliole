import type { SQLiteDBConnection } from '@capacitor-community/sqlite';

import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { COMPANION_DATABASE_NAME, COMPANION_DATABASE_VERSION } from '../../../../../lib/platform/nativeCompanionContract';
import { createCapacitorSqliteDbPort } from '../../capacitorSqliteDbPort';

import type { CapacitorCompanionDatabaseManager } from './capacitorCompanionDatabaseOwner';

/** The plugin permits one readonly connection per database, independent of its writer. */
export class CompanionRequestSyncSnapshots {
  private tail: Promise<void> = Promise.resolve();
  private readonly lifetime = new AbortController();
  private hasConnection = false;

  constructor(private readonly manager: CapacitorCompanionDatabaseManager,
    private readonly platform: 'android' | 'ios') {}

  read<T>(execute: (db: DbPort) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const combined = signal ? AbortSignal.any([signal, this.lifetime.signal]) : this.lifetime.signal;
    const result = this.tail.then(() => this.snapshot(execute, combined));
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  async close() {
    this.lifetime.abort(new Error('request_sync_snapshot_owner_closed'));
    await this.tail;
    await this.releaseConnection();
  }

  private async snapshot<T>(execute: (db: DbPort) => Promise<T>, signal: AbortSignal) {
    signal.throwIfAborted();
    await this.releaseConnection();
    const connection = await this.manager.createConnection(COMPANION_DATABASE_NAME,
      false, 'no-encryption', COMPANION_DATABASE_VERSION, true);
    this.hasConnection = true;
    try {
      await connection.open();
      signal.throwIfAborted();
      return await this.readTransaction(connection, execute, signal);
    } finally {
      await this.releaseConnection();
    }
  }

  private async releaseConnection() {
    if (!this.hasConnection) return;
    await this.manager.closeConnection(COMPANION_DATABASE_NAME, true);
    this.hasConnection = false;
  }

  private async readTransaction<T>(connection: SQLiteDBConnection,
    execute: (db: DbPort) => Promise<T>, signal: AbortSignal) {
    const reader = createCapacitorSqliteDbPort(connection, this.platform);
    let active = true;
    const check = () => {
      signal.throwIfAborted();
      if (!active) throw new Error('request_sync_snapshot_closed');
    };
    const db: DbPort = {
      async query(sql, params) { check(); return reader.query(sql, params); },
      async run() { throw new Error('request_sync_snapshot_write_forbidden'); },
      async transaction(callback) { check(); return callback(db); }
    };
    // Plugin transaction methods address the writer; query preserves the readonly flag.
    await connection.query('BEGIN DEFERRED', []);
    try {
      const result = await execute(db);
      check();
      return result;
    } finally {
      active = false;
      await connection.query('ROLLBACK', []);
    }
  }
}
