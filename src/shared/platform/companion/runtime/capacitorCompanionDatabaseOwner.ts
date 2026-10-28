import type { SQLiteDBConnection } from '@capacitor-community/sqlite';

import {
  bootstrapCompanionDatabase,
  checkpointCompanionDatabase,
  type CompanionDatabaseBootstrapRequest,
  type CompanionDatabaseBootstrapResult
} from '../../../../../lib/core/database/companionDatabaseLifecycle';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from '../../../../../lib/core/database/syncGroupSchemaStatements';
import type { WorkspaceRefreshScope } from '../../../../../lib/core/database/workspaceSnapshotRefresh';
import type { PriorityIndexNode } from '../../../../../lib/core/nodes/workspaceNodePriorityState';
import type { RegularPushQueuePriority } from '../../../../../lib/core/review/unifiedPushQueueRules';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { COMPANION_DATABASE_NAME } from '../../../../../lib/platform/nativeCompanionContract';
import { createCapacitorSqliteDbPort } from '../../capacitorSqliteDbPort';

import { loadCompanionForegroundOwner } from './companionForegroundTimeOwner';
import { CompanionNodePriorityState } from './companionNodePriorityState';
import { createOwnedCompanionConnection } from './companionOwnedConnection';
import { CompanionRequestSyncSnapshots } from './companionRequestSyncSnapshot';

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
  private operationTail: Promise<void> = Promise.resolve();
  private readonly backgroundReaders = new Set<AbortController>();
  private snapshots: CompanionRequestSyncSnapshots | null = null;
  private readonly nodePriorities = new CompanionNodePriorityState();

  constructor(
    private readonly manager: CapacitorCompanionDatabaseManager,
    readonly platform: 'android' | 'ios'
  ) {}

  open(request: Omit<CompanionDatabaseBootstrapRequest, 'allowCreate'> & { allowCreate?: boolean }) {
    return this.enqueue(() => this.openDatabase(request));
  }

  private async openDatabase(request: Omit<CompanionDatabaseBootstrapRequest, 'allowCreate'> & { allowCreate?: boolean }) {
    if (this.connection) throw new Error('Companion database owner is already open.');
    const existed = Boolean((await this.manager.isDatabase(COMPANION_DATABASE_NAME)).result);
    if (!existed && request.allowCreate === false) throw new Error('Companion database creation is blocked.');
    const connection = await this.openConnection();
    const db = createCapacitorSqliteDbPort(connection, this.platform);
    try {
      await db.query('PRAGMA busy_timeout = 5000');
      const result = await bootstrapCompanionDatabase(db, { expectedJournalMode: 'wal', ...request, allowCreate: !existed });
      // In-memory editor drafts cannot survive a fresh renderer/database owner session.
      await db.run("DELETE FROM node_version_local_holds WHERE hold_id LIKE 'companion:%'");
      if (this.platform === 'android') {
        for (const statement of SYNC_GROUP_SCHEMA_STATEMENTS) await db.run(statement);
      }
      const url = (await connection.getUrl()).url;
      if (!url) throw new Error('Companion database did not return a path.');
      const databasePath = normalizeDatabasePath(url);
      this.connection = connection;
      this.db = db;
      this.journalMode = result.journalMode;
      this.path = databasePath;
      this.snapshots = new CompanionRequestSyncSnapshots(this.manager, this.platform);
      return { ...result, databasePath } satisfies CapacitorCompanionOpenResult;
    } catch (error) {
      await this.manager.closeConnection(COMPANION_DATABASE_NAME, false).catch(() => undefined);
      throw error;
    }
  }

  read<T>(task: (db: DbPort) => Promise<T>) {
    return this.enqueue(() => task(this.requireDb()));
  }

  readSnapshot<T>(task: (db: DbPort) => Promise<T>, signal?: AbortSignal): Promise<T> {
    return this.enqueueSnapshot(task, signal);
  }

  private async enqueueSnapshot<T>(task: (db: DbPort) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const registered = await this.enqueue(() => {
      this.requireDb();
      return Promise.resolve({ result: this.snapshots!.read(task, signal) });
    });
    return registered.result;
  }

  get databasePath() {
    if (!this.path) throw new Error('Companion database owner is not open.');
    return this.path;
  }

  async readBackgroundSnapshot<T>(task: (db: DbPort) => Promise<T>, signal?: AbortSignal) {
    const controller = new AbortController();
    const cancel = () => controller.abort(signal?.reason);
    if (signal?.aborted) cancel();
    else signal?.addEventListener('abort', cancel, { once: true });
    this.backgroundReaders.add(controller);
    try { return await this.enqueueSnapshot(task, controller.signal); }
    finally {
      this.backgroundReaders.delete(controller);
      signal?.removeEventListener('abort', cancel);
    }
  }

  runWriter<T>(task: (db: DbPort) => Promise<T>): Promise<T> {
    for (const reader of this.backgroundReaders) reader.abort(new Error('attachment_scan_foreground_write'));
    return this.enqueue(() => task(this.requireDb()));
  }

  readNodePriorities(db: DbPort, defaultPriority: RegularPushQueuePriority, initial?: Iterable<PriorityIndexNode>) {
    if (db !== this.requireDb()) throw new Error('node_priority_index_requires_owned_connection');
    return this.nodePriorities.read(db, defaultPriority, initial);
  }

  refreshNodePriorities(scope: WorkspaceRefreshScope, db?: DbPort) {
    if (db) {
      if (db !== this.requireDb()) throw new Error('node_priority_index_requires_owned_connection');
      return this.nodePriorities.refresh(db, scope);
    }
    return this.enqueue(() => this.nodePriorities.refresh(this.requireDb(), scope));
  }

  get nodePriorityRevision() { return this.nodePriorities.revision; }

  clearNodePriorities() { this.nodePriorities.clear(); }

  foregroundTimeOwnerId() {
    return this.enqueue(() => loadCompanionForegroundOwner({
      manager: this.manager, libraryPath: this.databasePath, platform: this.platform
    }));
  }

  close() {
    return this.enqueue(() => this.closeDatabase());
  }

  private async closeDatabase() {
    if (!this.connection || !this.db || !this.journalMode) return;
    await this.snapshots?.close();
    await checkpointCompanionDatabase(this.db, this.journalMode);
    await this.manager.closeConnection(COMPANION_DATABASE_NAME, false);
    this.connection = null;
    this.db = null;
    this.journalMode = null;
    this.path = null;
    this.snapshots = null;
    this.nodePriorities.clear();
  }

  // Keep the complete operation on the single connection, including asynchronous reads.
  // Callbacks use their supplied DbPort; they must not enqueue nested owner operations.
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const execute = this.operationTail.then(task);
    this.operationTail = execute.then(() => undefined, () => undefined);
    return execute;
  }

  private async openConnection() {
    const existing = await this.manager.isConnection(COMPANION_DATABASE_NAME, false);
    const connection = existing.result
      ? await this.manager.retrieveConnection(COMPANION_DATABASE_NAME, false)
      : await createOwnedCompanionConnection(this.manager, false);
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
