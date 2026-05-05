import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';

import { applySyncNodesWithDbPort } from '../../../lib/core/sync/syncNodeApplyExecutor';
import type { NativeSyncNodeRecord } from '../../../lib/platform/nativeSyncContract';

import { createCapacitorSqliteDbPort } from './capacitorSqliteDbPort';
import {
  isNativeAndroidCompanionRuntime
} from './companionWorkspaceSyncBridge';

const COMPANION_DATABASE_NAME = 'foliole-companion';
const COMPANION_DATABASE_VERSION = 14;

export interface CompanionSqliteConnectionManager {
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

export async function applyCompanionSyncNodeVersions(nodes: NativeSyncNodeRecord[]) {
  if (!isNativeAndroidCompanionRuntime() || nodes.length === 0) {
    return [];
  }
  return applyCompanionSyncNodeVersionsWithSharedCoreOnDevice(nodes);
}

export async function applyCompanionSyncNodeVersionsWithSharedCore(
  connection: SQLiteDBConnection,
  nodes: NativeSyncNodeRecord[]
) {
  const port = createCapacitorSqliteDbPort(connection);
  const result = await applySyncNodesWithDbPort(port, nodes, { includeAlreadyApplied: true });
  if (result.conflictNodes.length > 0) {
    throw new Error('shared_node_conflict_copy_not_migrated');
  }
  return result.appliedIds;
}

export async function applyCompanionSyncNodeVersionsWithSharedCoreOnDevice(
  nodes: NativeSyncNodeRecord[],
  manager: CompanionSqliteConnectionManager = new SQLiteConnection(CapacitorSQLite)
) {
  const connection = await openCompanionDatabaseConnection(manager);
  return applyCompanionSyncNodeVersionsWithSharedCore(connection, nodes);
}

export async function openCompanionDatabaseConnection(manager: CompanionSqliteConnectionManager) {
  const existing = await manager.isConnection(COMPANION_DATABASE_NAME, false).catch(() => ({ result: false }));
  const connection = existing.result
    ? await manager.retrieveConnection(COMPANION_DATABASE_NAME, false)
    : await manager.createConnection(
      COMPANION_DATABASE_NAME,
      false,
      'no-encryption',
      COMPANION_DATABASE_VERSION,
      false
    );
  await connection.open();
  return connection;
}
