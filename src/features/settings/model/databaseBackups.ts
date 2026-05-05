import {
  createDatabaseBackupInRuntime,
  hasDatabaseBackupRuntimeRepository,
  listDatabaseBackupsFromRuntime,
  restoreDatabaseBackupInRuntime,
  type RuntimeSqliteBackupResult,
  type RuntimeSqliteRestoreResult
} from '../../../shared/platform/databaseBackupRuntimeRepository';

export interface DatabaseBackupEntry {
  fileName: string;
  filePath: string;
  kind: 'manual' | 'automatic' | 'snapshot';
  autoFrequency: 'hourly' | 'daily' | 'weekly' | 'monthly' | null;
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
  value: RuntimeSqliteBackupResult;
}

export interface DatabaseRestoreSuccessResult {
  ok: true;
  value: RuntimeSqliteRestoreResult;
}

export type DatabaseBackupActionResult = DatabaseBackupSuccessResult | DatabaseBackupErrorResult;
export type DatabaseRestoreActionResult = DatabaseRestoreSuccessResult | DatabaseBackupErrorResult;

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
  const kind =
    payload.kind === 'snapshot' || payload.kind === 'automatic' || payload.kind === 'manual'
      ? payload.kind
      : null;
  const autoFrequency =
    payload.autoFrequency === 'hourly' ||
    payload.autoFrequency === 'daily' ||
    payload.autoFrequency === 'weekly' ||
    payload.autoFrequency === 'monthly'
      ? payload.autoFrequency
      : null;
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
  return { autoFrequency, fileName, filePath, kind, snapshotReason, sizeBytes, updatedAt };
}

function normalizeSqliteBackupResult(value: unknown): RuntimeSqliteBackupResult | null {
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

function normalizeSqliteRestoreResult(value: unknown): RuntimeSqliteRestoreResult | null {
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
  return hasDatabaseBackupRuntimeRepository();
}

export async function listDatabaseBackups(): Promise<DatabaseBackupEntry[]> {
  if (!hasDatabaseBackupRuntimeRepository()) {
    return [];
  }
  try {
    const result = await listDatabaseBackupsFromRuntime();
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
  if (!hasDatabaseBackupRuntimeRepository()) {
    return null;
  }
  try {
    const result = normalizeSqliteBackupResult(await createDatabaseBackupInRuntime());
    if (!result) {
      return { ok: false, errorMessage: 'Backup completed but returned an invalid payload.' };
    }
    return { ok: true, value: result };
  } catch (error) {
    return { ok: false, errorMessage: readErrorMessage(error) };
  }
}

export async function restoreDatabaseBackup(sourcePath: string): Promise<DatabaseRestoreActionResult | null> {
  if (!hasDatabaseBackupRuntimeRepository()) {
    return null;
  }
  try {
    const result = normalizeSqliteRestoreResult(await restoreDatabaseBackupInRuntime(sourcePath));
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
