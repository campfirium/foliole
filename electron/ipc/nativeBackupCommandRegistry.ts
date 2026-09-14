import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

export const NATIVE_BACKUP_COMMAND_REGISTRY = [
  { command: NATIVE_COMMANDS.loadDatabaseSpaceStatus, route: 'storage', capability: 'read' },
  { command: NATIVE_COMMANDS.loadBackupSettings, route: 'storage', capability: 'read' },
  { command: NATIVE_COMMANDS.loadBackupRetentionStatus, route: 'storage', capability: 'read' },
  { command: NATIVE_COMMANDS.saveBackupSettings, route: 'storage', capability: 'settingsMutation' },
  { command: NATIVE_COMMANDS.listSqliteBackups, route: 'storage', capability: 'read' },
  { command: NATIVE_COMMANDS.backupSqliteDatabase, route: 'storage', capability: 'filesystemWrite' },
  { command: NATIVE_COMMANDS.restoreSqliteDatabase, route: 'storage', capability: 'restoreMutation' },
  { command: NATIVE_COMMANDS.compactSqliteDatabase, route: 'storage', capability: 'restoreMutation' },
  { command: NATIVE_COMMANDS.startBackupSearch, route: 'storage', capability: 'read' },
  { command: NATIVE_COMMANDS.nextBackupSearch, route: 'storage', capability: 'read' },
  { command: NATIVE_COMMANDS.cancelBackupSearch, route: 'storage', capability: 'read' }
] as const;
