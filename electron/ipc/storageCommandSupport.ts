import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import {
  createApplicationDatabaseBackup,
  listApplicationDatabaseBackups,
  restoreApplicationDatabaseBackup
} from '../database/backupRestore.js';

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

export function handleSqliteMaintenanceCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.listSqliteBackups) {
    return listApplicationDatabaseBackups();
  }
  if (command === NATIVE_COMMANDS.backupSqliteDatabase) {
    return createApplicationDatabaseBackup({
      destinationPath: asNullableString(args.destinationPath, 'destinationPath') ?? undefined
    });
  }
  if (command === NATIVE_COMMANDS.restoreSqliteDatabase) {
    return restoreApplicationDatabaseBackup({
      sourcePath: asString(args.sourcePath, 'sourcePath')
    });
  }
  return undefined;
}
