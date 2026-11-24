import type { SQLiteDBConnection } from '@capacitor-community/sqlite';

import {
  bootstrapCompanionDatabase,
  checkpointCompanionDatabase,
  type CompanionDatabaseBootstrapRequest,
  type CompanionDatabaseBootstrapResult
} from '../../../../../lib/core/database/companionDatabaseLifecycle';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from '../../../../../lib/core/database/syncGroupSchemaStatements';
import type { WorkspaceRefreshScope } from '../../../../../lib/core/database/workspaceSnapshotRefresh';
import { timeFlow, timeFlowQueue, type FlowTiming, type FlowTimingStage } from '../../../../../lib/core/flow/flowTiming';
import type { PriorityIndexNode } from '../../../../../lib/core/nodes/workspaceNodePriorityState';
import type { RegularPushQueuePriority } from '../../../../../lib/core/review/unifiedPushQueueRules';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import type { CompanionFolderBackupPort } from '../../../../../lib/platform/companionFolderBackupContract';
import { COMPANION_DATABASE_NAME } from '../../../../../lib/platform/nativeCompanionContract';
import { createCapacitorSqliteDbPort } from '../../capacitorSqliteDbPort';
import { clearRetiredCompanionEditHistory, createCompanionEditHistorySession, readConfirmedCompanionEditHistory } from '../editing/companionEditHistorySession';
import { CompanionFolderBackupSource } from '../folderBackup/companionFolderBackupSource';

import { CompanionDatabaseCommits } from './companionDatabaseCommits';
import { loadCompanionForegroundOwner } from './companionForegroundTimeOwner';
import { CompanionNodePriorityState } from './companionNodePriorityState';
import { createOwnedCompanionConnection } from './companionOwnedConnection';
import { openCompanionReadIntentStorage } from './companionReadIntentStorage';
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

/**
 * What a writer changes, chosen explicitly by every caller (there is no default).
 *
 * - `business`: library data the user would lose without a backup (nodes, reviews, reading, settings,
 *   sync membership). It aborts background attachment scans, marks the folder backup stale and wakes
 *   automatic backup.
 * - `usage`: foreground-time statistics. Still synchronized, but recorded every minute while the App is open.
 * - `device-local`: shell context that never leaves this device, such as navigation and flow resume positions.
 * - `backup`: the folder backup's own bookkeeping; marking it stale would make every backup schedule another.
 * - `derived`: caches rebuilt from library data, such as the attachment reference cache written by the scan.
 *
 * Only `business` writes have the side effects above; every other kind commits silently.
 */
export type CompanionWriteKind = 'business' | 'usage' | 'device-local' | 'backup' | 'derived';

export interface CompanionWriterOptions {
  kind: CompanionWriteKind;
  timing?: FlowTiming | undefined;
  queue?: FlowTimingStage | undefined;
}

function isLibraryChange(kind: CompanionWriteKind) {
  return kind === 'business';
}

export class CapacitorCompanionDatabaseOwner {
  readonly committedWrites = new CompanionDatabaseCommits();
  private connection: SQLiteDBConnection | null = null;
  private db: DbPort | null = null;
  private journalMode: CompanionDatabaseBootstrapResult['journalMode'] | null = null;
  private path: string | null = null;
  private operationTail: Promise<void> = Promise.resolve();
  private pendingCloses = 0;
  private readonly backgroundReaders = new Set<AbortController>();
  private snapshots: CompanionRequestSyncSnapshots | null = null;
  private readIntents: Awaited<ReturnType<typeof openCompanionReadIntentStorage>> | null = null;
  private readonly nodePriorities = new CompanionNodePriorityState();
  private nativeBackupSource = new CompanionFolderBackupSource();

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
    const db = createCompanionEditHistorySession(createCapacitorSqliteDbPort(connection, this.platform));
    try {
      await db.query('PRAGMA busy_timeout = 5000');
      const result = await bootstrapCompanionDatabase(db, { expectedJournalMode: 'wal', ...request, allowCreate: !existed });
      // In-memory editor drafts cannot survive a fresh renderer/database owner session.
      await db.run("DELETE FROM node_version_local_holds WHERE hold_id LIKE 'companion:%'");
      await clearRetiredCompanionEditHistory(db);
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
      this.nativeBackupSource = new CompanionFolderBackupSource();
      this.snapshots = new CompanionRequestSyncSnapshots(this.manager, this.platform);
      return { ...result, databasePath } satisfies CapacitorCompanionOpenResult;
    } catch (error) {
      await this.manager.closeConnection(COMPANION_DATABASE_NAME, false).catch(() => undefined);
      throw error;
    }
  }

  getEditingHistory() { return readConfirmedCompanionEditHistory(this.requireDb()); }

  read<T>(task: (db: DbPort) => Promise<T>) {
    return this.enqueue(() => task(this.requireDb()));
  }

  readSnapshot<T>(task: (db: DbPort) => Promise<T>, signal?: AbortSignal): Promise<T> {
    return this.enqueueSnapshot(task, signal);
  }

  async readInteractiveSnapshot<T>(task: (db: DbPort) => Promise<T>, signal?: AbortSignal): Promise<T> {
    this.requireDb();
    if (this.pendingCloses) throw new Error('Companion database owner is closing.');
    // Foreground bodies read committed WAL state without joining the writer queue.
    // Borrow an active sync snapshot with an independent read lifetime when possible.
    return this.snapshots!.readInteractive(task, signal);
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

  folderBackupSource(port: CompanionFolderBackupPort) {
    this.requireDb();
    if (this.pendingCloses) throw new Error('Companion database owner is closing.');
    return this.nativeBackupSource.acquire(this.databasePath, port);
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

  runWriter<T>(task: (db: DbPort) => Promise<T>, write: CompanionWriterOptions): Promise<T> {
    const libraryChange = isLibraryChange(write.kind);
    if (libraryChange) this.abortBackgroundReaders();
    return timeFlowQueue(write.timing, write.queue ?? 'mutation-writer', execute => this.enqueue(execute),
      () => timeFlow(write.timing, 'write', () => this.committedWrites.write(this.requireDb(), task, write.kind)));
  }

  runWriterSequence<T>(task: (db: DbPort, commit: DbPort['transaction']) => Promise<T>,
    write: Omit<CompanionWriterOptions, 'queue'>): Promise<T> {
    const libraryChange = isLibraryChange(write.kind);
    if (libraryChange) this.abortBackgroundReaders();
    return timeFlowQueue(write.timing, 'mutation-writer', execute => this.enqueue(execute),
      () => task(this.requireDb(), execute => timeFlow(write.timing, 'write',
        () => this.committedWrites.write(this.requireDb(), execute, write.kind))));
  }

  private abortBackgroundReaders() {
    for (const reader of this.backgroundReaders) reader.abort(new Error('attachment_scan_foreground_write'));
  }

  readNodePriorities(db: DbPort, defaultPriority: RegularPushQueuePriority, initial?: Iterable<PriorityIndexNode>) {
    if (db !== this.requireDb()) throw new Error('node_priority_index_requires_owned_connection');
    return this.nodePriorities.read(db, defaultPriority, initial);
  }

  readNodeIndex(db: DbPort, defaultPriority: RegularPushQueuePriority, initial?: Iterable<PriorityIndexNode>) {
    if (db !== this.requireDb()) throw new Error('node_index_requires_owned_connection');
    return this.nodePriorities.readIndex(db, defaultPriority, initial);
  }

  readNodeMetadata(db: DbPort) {
    if (db !== this.requireDb()) throw new Error('node_metadata_index_requires_owned_connection');
    return this.nodePriorities.readMetadata(db);
  }

  readNodeOrder(db: DbPort, initial?: readonly string[]) {
    if (db !== this.requireDb()) throw new Error('node_order_index_requires_owned_connection');
    return this.nodePriorities.readOrder(db, initial);
  }

  refreshNodePriorities(scope: WorkspaceRefreshScope, db?: DbPort, defer = false) {
    if (db) {
      if (db !== this.requireDb()) throw new Error('node_priority_index_requires_owned_connection');
      return this.nodePriorities.refresh(db, scope, defer);
    }
    return this.enqueue(() => this.nodePriorities.refresh(this.requireDb(), scope));
  }

  get nodePriorityRevision() { return this.nodePriorities.revision; }

  clearNodePriorities() { this.nodePriorities.clear(); }

  readIntentJournal() {
    return this.enqueue(async () => {
      this.readIntents ??= await openCompanionReadIntentStorage({ db: this.requireDb(),
        manager: this.manager, createPort: connection => createCapacitorSqliteDbPort(connection, this.platform) });
      return this.readIntents.journal;
    });
  }

  foregroundTimeOwnerId() {
    return this.enqueue(() => loadCompanionForegroundOwner({
      manager: this.manager, libraryPath: this.databasePath, platform: this.platform
    }));
  }

  close() {
    this.pendingCloses += 1;
    const nativeClose = this.nativeBackupSource.close();
    // Observe early rejection while queued writes drain; the close below still propagates it.
    nativeClose.catch(() => undefined);
    return this.enqueue(async () => {
      await nativeClose;
      return this.closeDatabase();
    }).finally(() => { this.pendingCloses -= 1; });
  }

  private async closeDatabase() {
    if (!this.connection || !this.db || !this.journalMode) return;
    await this.snapshots?.close();
    await this.readIntents?.close();
    this.readIntents = null;
    await checkpointCompanionDatabase(this.db, this.journalMode);
    await this.manager.closeConnection(COMPANION_DATABASE_NAME, false);
    this.connection = null;
    this.db = null;
    this.committedWrites.resetUsageChanges();
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
