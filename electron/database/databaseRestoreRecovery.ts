import path from 'node:path';

import { initializeWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';

import { materializeCompressedSqliteBackup } from './compressedSqliteBackup.js';
import {
  clearDatabaseConnectionUnavailable,
  closeDatabaseConnection,
  markDatabaseConnectionUnavailable,
  openDatabaseConnection
} from './connection.js';
import type { ManagedSafetySnapshot } from './managedSafetySnapshots.js';
import { initializeDatabase } from './migrate.js';
import { restoreSqliteDatabase } from './sqliteBackupRestore.js';

export async function recoverCurrentDatabaseAfterRestoreFailure(args: {
  error: unknown;
  replacementComplete: boolean;
  safetySnapshot: ManagedSafetySnapshot;
  targetPath: string;
}) {
  console.error('[backup] restore failed after closing current database; rolling back', args.error);
  let rollback: Awaited<ReturnType<typeof materializeCompressedSqliteBackup>> | null = null;
  try {
    closeDatabaseConnection();
    if (!args.replacementComplete) {
      initializeWorkspaceSearchSidecar(openDatabaseConnection({ applyJournalMode: false }), {
        requireCurrentSource: true
      });
      clearDatabaseConnectionUnavailable();
      return;
    }
    rollback = await materializeCompressedSqliteBackup(
      args.safetySnapshot.currentPath,
      path.dirname(args.targetPath)
    );
    await restoreSqliteDatabase({ sourcePath: rollback.databasePath, targetPath: args.targetPath });
    initializeWorkspaceSearchSidecar(initializeDatabase(), { requireCurrentSource: true });
    clearDatabaseConnectionUnavailable();
  } catch (rollbackError) {
    const unavailable = new Error(
      'The selected backup was not restored, and Foliole could not reopen the current library. ' +
      'Keep your backup files and restart Foliole before making more changes.'
    );
    console.error('[backup] restore rollback failed; database writes are disabled', {
      restoreError: args.error,
      rollbackError
    });
    closeDatabaseConnection();
    markDatabaseConnectionUnavailable(unavailable);
    throw unavailable;
  } finally {
    await rollback?.cleanup();
  }
}
