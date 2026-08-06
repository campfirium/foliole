import type { SQLiteDBConnection } from '@capacitor-community/sqlite';

import {
  bootstrapCompanionDatabase,
  checkpointCompanionDatabase,
  type CompanionDatabaseBootstrapRequest,
  type CompanionDatabaseBootstrapResult
} from '../../../../../lib/core/database/companionDatabaseLifecycle';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { COMPANION_DATABASE_NAME, COMPANION_DATABASE_VERSION } from '../../../../../lib/platform/nativeCompanionContract';
import { createCapacitorSqliteDbPort } from '../../capacitorSqliteDbPort';

export interface CapacitorCompanionDatabaseManager {
  closeConnection(database: string, readonly: boolean): Promise<void>;
  createConnection(
    database: string,
    encrypted: boolean,
    mode: string,
    version: number,
    readonly: boolean
  ): Promise<SQLiteDBConnection>;
  isConnection(database: string, readonly: boolean): Promise<{ result?: boolean }>;
  isDatabase(database: string): Promise<{ result?: boolean }>;
  retrieveConnection(database: string, readonly: boolean): Promise<SQLiteDBConnection>;
}

export interface CapacitorCompanionOpenResult extends CompanionDatabaseBootstrapResult {
  databasePath: string;
}

export class CapacitorCompanionDatabaseOwner {
  private connection: SQLiteDBConnection | null = null;
  private db: DbPort | null = null;
  private journalMode: CompanionDatabaseBootstrapResult['journalMode'] | null = null;
  private path: string | null = null;
  private writerTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly manager: CapacitorCompanionDatabaseManager,
    readonly platform: 'android' | 'ios'
  ) {}

  async open(request: Omit<CompanionDatabaseBootstrapRequest, 'allowCreate'> & { allowCreate?: boolean }) {
    if (this.connection) throw new Error('Companion database owner is already open.');
    const existed = Boolean((await this.manager.isDatabase(COMPANION_DATABASE_NAME)).result);
    if (!existed && request.allowCreate === false) throw new Error('Companion database creation is blocked.');
    const connection = await this.openConnection();
    const db = createCapacitorSqliteDbPort(connection, this.platform);
    try {
      await db.query('PRAGMA busy_timeout = 5000');
      const result = await bootstrapCompanionDatabase(db, { ...request, allowCreate: !existed });
      const url = (await connection.getUrl()).url;
      if (!url) throw new Error('Companion database did not return a path.');
      const databasePath = normalizeDatabasePath(url);
      this.connection = connection;
      this.db = db;
      this.journalMode = result.journalMode;
      this.path = databasePath;
      return { ...result, databasePath } satisfies CapacitorCompanionOpenResult;
    } catch (error) {
      await this.manager.closeConnection(COMPANION_DATABASE_NAME, false).catch(() => undefined);
      throw error;
    }
  }

  async read<T>(task: (db: DbPort) => Promise<T>) {
    await this.writerTail;
    return task(this.requireDb());
  }

  get databasePath() {
    if (!this.path) throw new Error('Companion database owner is not open.');
    return this.path;
  }

  runWriter<T>(task: (db: DbPort) => Promise<T>): Promise<T> {
    const execute = this.writerTail.then(() => task(this.requireDb()));
    this.writerTail = execute.then(() => undefined, () => undefined);
    return execute;
  }

  async close() {
    if (!this.connection || !this.db || !this.journalMode) return;
    await this.writerTail;
    await checkpointCompanionDatabase(this.db, this.journalMode);
    await this.manager.closeConnection(COMPANION_DATABASE_NAME, false);
    this.connection = null;
    this.db = null;
    this.journalMode = null;
    this.path = null;
  }

  private async openConnection() {
    const existing = await this.manager.isConnection(COMPANION_DATABASE_NAME, false);
    const connection = existing.result
      ? await this.manager.retrieveConnection(COMPANION_DATABASE_NAME, false)
      : await this.manager.createConnection(
        COMPANION_DATABASE_NAME, false, 'no-encryption', COMPANION_DATABASE_VERSION, false
      );
    if (!(await connection.isDBOpen()).result) await connection.open();
    return connection;
  }

  private requireDb() {
    if (!this.db) throw new Error('Companion database owner is not open.');
    return this.db;
  }
}

function normalizeDatabasePath(value: string) {
  if (!value.startsWith('file:')) return value;
  try {
    return decodeURIComponent(new URL(value).pathname);
  } catch {
    throw new Error('Companion database returned an invalid file URL.');
  }
}
