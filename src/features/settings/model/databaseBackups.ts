import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { NativeSqliteBackupResult, NativeSqliteRestoreResult } from '../../../../lib/platform/nativeContract';
import { getRuntimeInvoke } from '../../../shared/platform/bridge';

export interface DatabaseBackupEntry {
  fileName: string;
  filePath: string;
  sizeBytes: number;
  updatedAt: string;
}

type UntypedInvoke = (command: string, args?: unknown) => Promise<unknown>;

function getUntypedRuntimeInvoke(): UntypedInvoke | null {
  return getRuntimeInvoke() as UntypedInvoke | null;
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeDatabaseBackupEntry(value: unknown): DatabaseBackupEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const payload = value as Record<string, unknown>;
  const fileName = readString(payload.fileName);
  const filePath = readString(payload.filePath);
  const sizeBytes = readNumber(payload.sizeBytes);
  const updatedAt = readString(payload.updatedAt);
  if (!fileName || !filePath || sizeBytes === null || !updatedAt) {
    return null;
  }
  return { fileName, filePath, sizeBytes, updatedAt };
}

function normalizeSqliteBackupResult(value: unknown): NativeSqliteBackupResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const payload = value as Record<string, unknown>;
  const sourcePath = readString(payload.sourcePath);
  const destinationPath = readString(payload.destinationPath);
  const totalPages = readNumber(payload.totalPages);
  const remainingPages = readNumber(payload.remainingPages);
  if (!sourcePath || !destinationPath || totalPages === null || remainingPages === null) {
    return null;
  }
  return { sourcePath, destinationPath, totalPages, remainingPages };
}

function normalizeSqliteRestoreResult(value: unknown): NativeSqliteRestoreResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const payload = value as Record<string, unknown>;
  const sourcePath = readString(payload.sourcePath);
  const targetPath = readString(payload.targetPath);
  const totalPages = readNumber(payload.totalPages);
  const remainingPages = readNumber(payload.remainingPages);
  if (!sourcePath || !targetPath || totalPages === null || remainingPages === null) {
    return null;
  }
  return { sourcePath, targetPath, totalPages, remainingPages };
}

export function areDatabaseBackupActionsAvailable() {
  return Boolean(getRuntimeInvoke());
}

export async function listDatabaseBackups(): Promise<DatabaseBackupEntry[]> {
  const runtimeInvoke = getUntypedRuntimeInvoke();
  if (!runtimeInvoke) {
    return [];
  }
  try {
    const result = await runtimeInvoke(NATIVE_COMMANDS.listSqliteBackups);
    if (!Array.isArray(result)) {
      return [];
    }
    return result
      .map(normalizeDatabaseBackupEntry)
      .filter((entry): entry is DatabaseBackupEntry => entry !== null)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    return [];
  }
}

export async function createDatabaseBackup(): Promise<NativeSqliteBackupResult | null> {
  const runtimeInvoke = getUntypedRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  try {
    return normalizeSqliteBackupResult(await runtimeInvoke(NATIVE_COMMANDS.backupSqliteDatabase, {}));
  } catch {
    return null;
  }
}

export async function restoreDatabaseBackup(sourcePath: string): Promise<NativeSqliteRestoreResult | null> {
  const runtimeInvoke = getUntypedRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  try {
    return normalizeSqliteRestoreResult(
      await runtimeInvoke(NATIVE_COMMANDS.restoreSqliteDatabase, { sourcePath })
    );
  } catch {
    return null;
  }
}

export function reloadAfterDatabaseRestore() {
  window.location.reload();
}
