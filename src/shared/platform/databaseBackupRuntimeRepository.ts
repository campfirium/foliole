import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type {
  NativeBackupSettings,
  NativeSourceDispositionRestoreResult,
  NativeSourceDispositionSummary,
  NativeSqliteBackupResult,
  NativeSqliteRestoreResult
} from '../../../lib/platform/nativeContract';

import { getRuntimeInvoke } from './runtimeInvoke';

export type RuntimeBackupSettings = NativeBackupSettings;
export type RuntimeSourceDispositionRestoreResult = NativeSourceDispositionRestoreResult;
export type RuntimeSourceDispositionSummary = NativeSourceDispositionSummary;
export type RuntimeSqliteBackupResult = NativeSqliteBackupResult;
export type RuntimeSqliteRestoreResult = NativeSqliteRestoreResult;

export function hasDatabaseBackupRuntimeRepository() {
  return Boolean(getRuntimeInvoke());
}

export async function loadDatabaseBackupSettingsFromRuntime(): Promise<unknown | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return runtimeInvoke(NATIVE_COMMANDS.loadBackupSettings);
}

export async function saveDatabaseBackupSettingsToRuntime(settings: RuntimeBackupSettings): Promise<unknown | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return runtimeInvoke(NATIVE_COMMANDS.saveBackupSettings, { settings });
}

export async function listDatabaseBackupsFromRuntime(): Promise<unknown | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return runtimeInvoke(NATIVE_COMMANDS.listSqliteBackups);
}

export async function createDatabaseBackupInRuntime(): Promise<unknown | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return runtimeInvoke(NATIVE_COMMANDS.backupSqliteDatabase, {});
}

export async function restoreDatabaseBackupInRuntime(sourcePath: string): Promise<unknown | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return runtimeInvoke(NATIVE_COMMANDS.restoreSqliteDatabase, { sourcePath });
}

export async function loadSourceDispositionSummaryFromRuntime(): Promise<unknown | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return runtimeInvoke(NATIVE_COMMANDS.loadSourceDispositionSummary);
}

export async function restoreSourceDispositionsInRuntime(): Promise<unknown | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return runtimeInvoke(NATIVE_COMMANDS.restoreSourceDispositions);
}

export async function resetSourceDispositionsInRuntime(): Promise<unknown | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return runtimeInvoke(NATIVE_COMMANDS.resetSourceDispositions);
}
