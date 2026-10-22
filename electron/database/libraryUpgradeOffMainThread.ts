import { existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';

import { DATABASE_SCHEMA_VERSION } from '../../lib/core/database/migrations.js';
import { NUMBERED_MIGRATION_BASE_VERSION } from '../../lib/core/database/numberedMigrations.js';
import { assertLibraryHomeMigrationCanOpenDatabase } from '../ipc/libraryPathMigrationRuntime.js';
import { resolveDesktopHostName } from '../sync/companionLanPayloads.js';

import {
  clearDatabaseConnectionUnavailable, closeDatabaseConnection, markDatabaseConnectionUnavailable, resolveDatabasePath
} from './connection.js';
import { runDatabaseUpgradeWorker } from './databaseUpgradeWorkerClient.js';
import type { DatabaseUpgradeProgress } from './databaseUpgradeWorkerContract.js';
import { reserveManagedMigrationSnapshot } from './managedSafetySnapshots.js';
import { resolveRuntimeDataPaths } from './runtimeDataPaths.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

function readStoredSchemaVersion(dbPath: string) {
  const sqlite = new BetterSqlite3(dbPath, { fileMustExist: true, readonly: true });
  try {
    return sqlite.pragma('user_version', { simple: true }) as number;
  } finally {
    sqlite.close();
  }
}

/**
 * Upgrade an existing library on a worker before the main connection opens it, so the window keeps
 * responding. The worker owns one schema transaction; on any failure it rolls back and the ordinary
 * main-thread initialization retries with its own snapshot, recovery and error surface.
 */
export async function upgradeLibraryDatabaseOffMainThread(
  onProgress: (progress: DatabaseUpgradeProgress) => void = () => undefined
): Promise<'skipped' | 'upgraded' | 'fallback'> {
  let dbPath: string;
  let snapshot: ReturnType<typeof reserveManagedMigrationSnapshot>;
  try {
    dbPath = resolveDatabasePath();
    assertLibraryHomeMigrationCanOpenDatabase(dbPath);
    if (!existsSync(dbPath)) return 'skipped';
    const version = readStoredSchemaVersion(dbPath);
    if (version < NUMBERED_MIGRATION_BASE_VERSION || version >= DATABASE_SCHEMA_VERSION) return 'skipped';
    snapshot = reserveManagedMigrationSnapshot(dbPath);
    onProgress({ from: version, to: DATABASE_SCHEMA_VERSION, version });
  } catch (error) {
    console.error('[database] background upgrade unavailable; using the main connection', error);
    return 'fallback';
  }
  const input = { assetsDir: resolveRuntimeDataPaths().assetsDir, dbPath,
    hostName: resolveDesktopHostName(), scope: 'library' as const, snapshotPath: snapshot.destinationPath };
  // Reading settings may open the main connection; the worker must be the only writer.
  closeDatabaseConnection();
  markDatabaseConnectionUnavailable(new Error('database_upgrade_in_progress'));
  try {
    await runDatabaseUpgradeWorker(input, onProgress);
  } catch (error) {
    snapshot.protection.release();
    rmSync(snapshot.destinationPath, { force: true });
    console.error('[database] background upgrade failed; retrying on the main connection', error);
    return 'fallback';
  } finally {
    clearDatabaseConnectionUnavailable();
  }
  snapshot.settle();
  return 'upgraded';
}
