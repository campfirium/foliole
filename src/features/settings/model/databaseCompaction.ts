import {
  compactDatabaseInRuntime,
  loadDatabaseSpaceStatusFromRuntime
} from '../../../shared/platform/databaseBackupRuntimeRepository';

export interface DatabaseSpaceStatus {
  databaseSizeBytes: number;
  reclaimableBytes: number;
  reclaimablePercent: number;
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizeDatabaseSpaceStatus(value: unknown): DatabaseSpaceStatus | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  const databaseSizeBytes = readNumber(payload.database_size_bytes);
  const reclaimableBytes = readNumber(payload.reclaimable_bytes);
  const reclaimablePercent = readNumber(payload.reclaimable_percent);
  if (databaseSizeBytes === null || reclaimableBytes === null || reclaimablePercent === null) return null;
  return { databaseSizeBytes, reclaimableBytes, reclaimablePercent };
}

export async function loadDatabaseSpaceStatus() {
  return normalizeDatabaseSpaceStatus(await loadDatabaseSpaceStatusFromRuntime());
}

export async function compactDatabase(): Promise<{ ok: boolean; errorMessage?: string }> {
  try {
    const result = await compactDatabaseInRuntime();
    return result ? { ok: true } : { ok: false, errorMessage: 'Desktop runtime unavailable.' };
  } catch (error) {
    const message = error instanceof Error && error.message.trim() ? error.message.trim() : 'Unknown desktop runtime error.';
    return { ok: false, errorMessage: message };
  }
}
