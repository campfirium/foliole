import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';

import { applySyncNodesWithDbPort } from '../../../lib/core/sync/syncNodeApplyExecutor';
import type { SyncNodeApplyOperation } from '../../../lib/core/sync/syncNodeApplyRules';
import { COMPANION_DATABASE_NAME, COMPANION_DATABASE_VERSION } from '../../../lib/platform/nativeCompanionContract';
import type { NativeSyncNodeRecord } from '../../../lib/platform/nativeSyncContract';

import { createCapacitorSqliteDbPort } from './capacitorSqliteDbPort';
import { runCompanionSyncWriterTask } from './companionSyncWriterQueue';
import {
  FolioleCompanionSync,
  isAvailableNativeAndroidCompanionRuntime,
  isNativeCompanionNodeVersionWriteRuntime
} from './companionWorkspaceRuntimeRepository';

export interface CompanionSqliteConnectionManager {
  checkConnectionsConsistency?(): Promise<{ result?: boolean }>;
  closeConnection?(database: string, readonly: boolean): Promise<void>;
  createConnection(
    database: string,
    encrypted: boolean,
    mode: string,
    version: number,
    readonly: boolean
  ): Promise<SQLiteDBConnection>;
  isConnection(database: string, readonly: boolean): Promise<{ result?: boolean }>;
  retrieveConnection(database: string, readonly: boolean): Promise<SQLiteDBConnection>;
}

export async function closeCompanionDatabaseConnection(
  manager: CompanionSqliteConnectionManager,
  connection: SQLiteDBConnection
) {
  await connection.close();
  await manager.closeConnection?.(COMPANION_DATABASE_NAME, false).catch(() => undefined);
}

export async function applyCompanionSyncNodeVersions(
  nodes: NativeSyncNodeRecord[],
  manager?: CompanionSqliteConnectionManager
) {
  if (!isNativeCompanionNodeVersionWriteRuntime() || nodes.length === 0) {
    return [];
  }
  return runCompanionSyncWriterTask(() => applyCompanionSyncNodeVersionsWithSharedCoreOnDevice(nodes, manager));
}

export async function applyCompanionTrashRestoreNodeVersions(
  nodes: NativeSyncNodeRecord[],
  manager?: CompanionSqliteConnectionManager
) {
  if (!isNativeCompanionNodeVersionWriteRuntime() || nodes.length === 0) {
    return [];
  }
  return runCompanionSyncWriterTask(() => (
    applyCompanionSyncNodeVersionsWithSharedCoreOnDevice(nodes, manager, 'local_restore')
  ));
}

export async function applyCompanionSyncNodeVersionsWithSharedCore(
  connection: SQLiteDBConnection,
  nodes: NativeSyncNodeRecord[],
  operation: SyncNodeApplyOperation = 'remote_sync'
) {
  const port = createCapacitorSqliteDbPort(connection);
  const result = await applySyncNodesWithDbPort(port, nodes, {
    enqueueSearchInvalidations: false,
    includeAlreadyApplied: true,
    operation
  });
  if (result.conflictNodes.length > 0) {
    throw new Error('shared_node_conflict_copy_not_migrated');
  }
  return result.appliedIds;
}

export async function applyCompanionSyncNodeVersionsWithSharedCoreOnDevice(
  nodes: NativeSyncNodeRecord[],
  manager: CompanionSqliteConnectionManager = new SQLiteConnection(CapacitorSQLite),
  operation: SyncNodeApplyOperation = 'remote_sync'
) {
  const connection = await openCompanionDatabaseConnection(manager);
  try {
    return await applyCompanionSyncNodeVersionsWithSharedCore(connection, nodes, operation);
  } finally {
    await closeCompanionDatabaseConnection(manager, connection);
  }
}

export async function openCompanionDatabaseConnection(manager: CompanionSqliteConnectionManager) {
  await releaseNativeDatabaseHelperConnection();
  const existing = await manager.isConnection(COMPANION_DATABASE_NAME, false).catch(() => ({ result: false }));
  const connection = existing.result
    ? await retrieveOrCreateCompanionConnection(manager)
    : await createOrRetrieveCompanionConnection(manager);
  if (!(await connection.isDBOpen()).result) await connection.open();
  return connection;
}

async function releaseNativeDatabaseHelperConnection() {
  if (!isAvailableNativeAndroidCompanionRuntime()) return;
  await FolioleCompanionSync.releaseDatabaseConnection();
}

async function retrieveOrCreateCompanionConnection(manager: CompanionSqliteConnectionManager) {
  try {
    return await manager.retrieveConnection(COMPANION_DATABASE_NAME, false);
  } catch (error) {
    if (!isMissingConnectionError(error)) {
      throw error;
    }
    await manager.checkConnectionsConsistency?.().catch(() => undefined);
    return createOrRetrieveCompanionConnection(manager);
  }
}

async function createOrRetrieveCompanionConnection(manager: CompanionSqliteConnectionManager) {
  try {
    return await manager.createConnection(
      COMPANION_DATABASE_NAME,
      false,
      'no-encryption',
      COMPANION_DATABASE_VERSION,
      false
    );
  } catch (error) {
    if (!isExistingConnectionError(error)) {
      throw error;
    }
    return retrieveExistingCompanionConnection(manager);
  }
}

async function retrieveExistingCompanionConnection(manager: CompanionSqliteConnectionManager) {
  try {
    return await manager.retrieveConnection(COMPANION_DATABASE_NAME, false);
  } catch (error) {
    if (!isMissingConnectionError(error)) {
      throw error;
    }
    await manager.checkConnectionsConsistency?.().catch(() => undefined);
    return manager.createConnection(
      COMPANION_DATABASE_NAME,
      false,
      'no-encryption',
      COMPANION_DATABASE_VERSION,
      false
    );
  }
}

function isExistingConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /connection .*already exists/i.test(message);
}

function isMissingConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /connection .*does not exist/i.test(message);
}
