import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { NativeSqliteBackupResult, NativeSqliteRestoreResult } from '../../../../lib/platform/nativeContract';
import { getRuntimeInvoke } from '../../../shared/platform/bridge';

export interface DatabaseBackupEntry {
  fileName: string;
  filePath: string;
  kind: 'backup' | 'snapshot';
  snapshotReason: 'pre-migration' | 'pre-restore' | null;
  sizeBytes: number;
  updatedAt: string;
}

export interface DatabaseBackupErrorResult {
  ok: false;
  errorMessage: string;
}

export interface DatabaseBackupSuccessResult {
  ok: true;
  value: NativeSqliteBackupResult;
}

export interface DatabaseRestoreSuccessResult {
  ok: true;
  value: NativeSqliteRestoreResult;
}

export type DatabaseBackupActionResult = DatabaseBackupSuccessResult | DatabaseBackupErrorResult;
export type DatabaseRestoreActionResult = DatabaseRestoreSuccessResult | DatabaseBackupErrorResult;

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
  const kind = payload.kind === 'snapshot' ? 'snapshot' : payload.kind === 'backup' ? 'backup' : null;
  const snapshotReason = payload.snapshotReason === 'pre-migration' || payload.snapshotReason === 'pre-restore'
    ? payload.snapshotReason
    : payload.snapshotReason === null || payload.snapshotReason === undefined
      ? null
      : null;
  const sizeBytes = readNumber(payload.sizeBytes);
  const updatedAt = readString(payload.updatedAt);
  if (!fileName || !filePath || !kind || sizeBytes === null || !updatedAt) {
    return null;
  }
  return { fileName, filePath, kind, snapshotReason, sizeBytes, updatedAt };
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

function readErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message.trim();
    }
  }
  return 'Unknown desktop runtime error.';
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

export async function createDatabaseBackup(): Promise<DatabaseBackupActionResult | null> {
  const runtimeInvoke = getUntypedRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  try {
    const result = normalizeSqliteBackupResult(await runtimeInvoke(NATIVE_COMMANDS.backupSqliteDatabase, {}));
    if (!result) {
      return { ok: false, errorMessage: 'Backup completed but returned an invalid payload.' };
    }
    return { ok: true, value: result };
  } catch (error) {
    return { ok: false, errorMessage: readErrorMessage(error) };
  }
}

export async function restoreDatabaseBackup(sourcePath: string): Promise<DatabaseRestoreActionResult | null> {
  const runtimeInvoke = getUntypedRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  try {
    const result = normalizeSqliteRestoreResult(
      await runtimeInvoke(NATIVE_COMMANDS.restoreSqliteDatabase, { sourcePath })
    );
    if (!result) {
      return { ok: false, errorMessage: 'Restore completed but returned an invalid payload.' };
    }
    return { ok: true, value: result };
  } catch (error) {
    return { ok: false, errorMessage: readErrorMessage(error) };
  }
}

export function reloadAfterDatabaseRestore() {
  window.location.reload();
}
