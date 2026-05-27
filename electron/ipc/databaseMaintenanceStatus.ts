import fs from 'node:fs/promises';

import type {
  NativeDatabaseMaintenanceBackupRole,
  NativeDatabaseMaintenanceEntry,
  NativeDatabaseMaintenanceKey,
  NativeDatabaseMaintenanceRebuildRole,
  NativeDatabaseMaintenanceStatus
} from '../../lib/platform/nativeDatabaseMaintenanceContract.js';
import {
  resolveExternalSearchDatabasePath,
  resolveSearchDatabasePath
} from '../database/databaseFilePaths.js';

import { loadLibraryPathSettingsSync } from './libraryPaths.js';

const SQLITE_FILE_SUFFIXES = ['', '-wal', '-shm'] as const;

interface DatabaseFileGroup {
  backupRole: NativeDatabaseMaintenanceBackupRole;
  key: NativeDatabaseMaintenanceKey;
  path: string;
  rebuildRole: NativeDatabaseMaintenanceRebuildRole;
}

function createDatabaseFileGroups(databasePath: string): DatabaseFileGroup[] {
  return [
    {
      backupRole: 'included',
      key: 'main-data',
      path: databasePath,
      rebuildRole: 'not-applicable'
    },
    {
      backupRole: 'excluded',
      key: 'search-data',
      path: resolveSearchDatabasePath(databasePath),
      rebuildRole: 'rebuildable-from-main-data'
    },
    {
      backupRole: 'excluded',
      key: 'external-sources-data',
      path: resolveExternalSearchDatabasePath(databasePath),
      rebuildRole: 'rebuildable-from-main-data'
    }
  ];
}

async function statSqliteFileGroup(basePath: string) {
  let sizeBytes = 0;
  let foundFile = false;

  for (const suffix of SQLITE_FILE_SUFFIXES) {
    try {
      const stat = await fs.stat(`${basePath}${suffix}`);
      foundFile = true;
      sizeBytes += stat.size;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        return { sizeBytes: null, state: 'unreadable' as const };
      }
    }
  }

  return foundFile
    ? { sizeBytes, state: 'present' as const }
    : { sizeBytes: 0, state: 'absent' as const };
}

async function toMaintenanceEntry(group: DatabaseFileGroup): Promise<NativeDatabaseMaintenanceEntry> {
  const status = await statSqliteFileGroup(group.path);
  return {
    backup_role: group.backupRole,
    key: group.key,
    rebuild_role: group.rebuildRole,
    size_bytes: status.sizeBytes,
    state: status.state
  };
}

export async function loadDatabaseMaintenanceStatus(): Promise<NativeDatabaseMaintenanceStatus> {
  const databasePath = loadLibraryPathSettingsSync().database_path;
  const entries = await Promise.all(createDatabaseFileGroups(databasePath).map(toMaintenanceEntry));
  return {
    entries,
    updated_at: new Date().toISOString()
  };
}

export const databaseMaintenanceStatusTestExports = {
  createDatabaseFileGroups,
  statSqliteFileGroup
};
