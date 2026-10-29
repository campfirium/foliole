import type { SQLiteDBConnection } from '@capacitor-community/sqlite';

import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { COMPANION_DATABASE_NAME } from '../../../../../lib/platform/nativeCompanionContract';
import { createCapacitorSqliteDbPort } from '../../capacitorSqliteDbPort';

import type { CapacitorCompanionDatabaseManager } from './capacitorCompanionDatabaseOwner';
import { createOwnedCompanionConnection } from './companionOwnedConnection';
import { CompanionReadonlySnapshotLease } from './companionReadonlySnapshotLease';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

type SnapshotEntry = {
  borrowable: boolean;
  ready: ReturnType<typeof deferred<CompanionReadonlySnapshotLease | null>>;
  done: ReturnType<typeof deferred<void>>;
};

/** The plugin permits one readonly connection per database, independent of its writer. */
export class CompanionRequestSyncSnapshots {
  private tail: Promise<void> = Promise.resolve();
  private readonly lifetime = new AbortController();
  private hasConnection = false;
  private readonly entries: SnapshotEntry[] = [];

  constructor(private readonly manager: CapacitorCompanionDatabaseManager,
    private readonly platform: 'android' | 'ios') {}

  read<T>(execute: (db: DbPort) => Promise<T>, signal?: AbortSignal): Promise<T> {
    return this.enqueue(execute, signal, true);
  }

  async readInteractive<T>(execute: (db: DbPort) => Promise<T>, signal?: AbortSignal): Promise<T> {
    this.checkCancellation(signal);
    const entry = this.entries[0];
    if (!entry?.borrowable) return this.enqueue(execute, signal, false);
    const lease = await entry.ready.promise;
    this.checkCancellation(signal);
    const reading = lease?.read(execute, signal);
    if (reading) return reading;
    await entry.done.promise;
    return this.readInteractive(execute, signal);
  }

  private enqueue<T>(execute: (db: DbPort) => Promise<T>, signal: AbortSignal | undefined,
    borrowable: boolean) {
    const entry: SnapshotEntry = { borrowable, ready: deferred(), done: deferred() };
    this.entries.push(entry);
    const result = this.tail.then(() => this.snapshot(execute, entry, signal)).finally(() => {
      entry.ready.resolve(null);
      this.entries.shift();
      entry.done.resolve();
    });
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  async close() {
    this.lifetime.abort(new Error('request_sync_snapshot_owner_closed'));
    await this.tail;
    await this.releaseConnection();
  }

  private checkCancellation(signal?: AbortSignal) {
    signal?.throwIfAborted();
    this.lifetime.signal.throwIfAborted();
  }

  private async snapshot<T>(execute: (db: DbPort) => Promise<T>, entry: SnapshotEntry, signal?: AbortSignal) {
    this.checkCancellation(signal);
    await this.releaseConnection();
    const connection = await createOwnedCompanionConnection(this.manager, true);
    this.hasConnection = true;
    try {
      await connection.open().catch(error => {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`request_sync_snapshot_open_failed:${this.platform}: ${detail}`, { cause: error });
      });
      this.checkCancellation(signal);
      return await this.readTransaction(connection, execute, entry, signal);
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
    execute: (db: DbPort) => Promise<T>, entry: SnapshotEntry, signal?: AbortSignal) {
    const reader = createCapacitorSqliteDbPort(connection, this.platform);
    // Plugin transaction methods address the writer; query preserves the readonly flag.
    await connection.query('BEGIN DEFERRED', []);
    const lease = new CompanionReadonlySnapshotLease(reader, this.lifetime.signal);
    entry.ready.resolve(lease);
    try {
      return await lease.read(execute, signal)!;
    } finally {
      await lease.finish();
      await connection.query('ROLLBACK', []);
    }
  }
}
