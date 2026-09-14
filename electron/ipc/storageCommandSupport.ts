import type { WebContents } from 'electron';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import {
  createApplicationDatabaseBackup,
  listApplicationDatabaseBackups,
  restoreApplicationDatabaseBackup
} from '../database/backupRestore.js';
import { loadBackupRetentionStatus } from '../database/backupRetentionStatus.js';
import { loadBackupSettings } from '../database/backupSettings.js';
import {
  compactApplicationDatabase,
  loadApplicationDatabaseSpaceStatus
} from '../database/databaseCompaction.js';

import {
  cancelBackupSearchSession,
  nextBackupSearchSession,
  startBackupSearchSession
} from './backupSearchSessions.js';
import { asNullableString, asString } from './commandParsers.js';

export function readSettingsObject(settings: unknown) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('invalid argument: settings');
  }
  return settings as Record<string, unknown>;
}

export function readObjectArg(value: unknown, field: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid argument: ${field}`);
  }
  return value as Record<string, unknown>;
}

export function handleSqliteMaintenanceCommand(
  command: string,
  args: Record<string, unknown>,
  owner?: WebContents
) {
  if (command === NATIVE_COMMANDS.startBackupSearch) {
    if (!owner) throw new Error('backup search requires a renderer owner');
    return startBackupSearchSession(asString(args.query, 'query'), owner);
  }
  if (command === NATIVE_COMMANDS.nextBackupSearch) {
    if (!owner) throw new Error('backup search requires a renderer owner');
    return nextBackupSearchSession(asString(args.session_id, 'session_id'), owner);
  }
  if (command === NATIVE_COMMANDS.cancelBackupSearch) {
    if (!owner) throw new Error('backup search requires a renderer owner');
    return cancelBackupSearchSession(asString(args.session_id, 'session_id'), owner).then(() => null);
  }
  if (command === NATIVE_COMMANDS.listSqliteBackups) {
    return listApplicationDatabaseBackups();
  }
  if (command === NATIVE_COMMANDS.loadBackupRetentionStatus) {
    return loadBackupRetentionStatus(loadBackupSettings());
  }
  if (command === NATIVE_COMMANDS.loadDatabaseSpaceStatus) {
    return loadApplicationDatabaseSpaceStatus();
  }
  if (command === NATIVE_COMMANDS.backupSqliteDatabase) {
    const destinationPath = asNullableString(args.destinationPath, 'destinationPath');
    return createApplicationDatabaseBackup({
      ...(destinationPath === null ? {} : { destinationPath })
    });
  }
  if (command === NATIVE_COMMANDS.restoreSqliteDatabase) {
    return restoreApplicationDatabaseBackup({
      sourcePath: asString(args.sourcePath, 'sourcePath')
    });
  }
  if (command === NATIVE_COMMANDS.compactSqliteDatabase) {
    return compactApplicationDatabase();
  }
  return undefined;
}
