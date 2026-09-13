import {
  hasSettingsRuntimeRepository,
  loadBackupRetentionStatusFromRuntime,
  type RuntimeBackupRetentionStatus
} from '../../../shared/platform/settingsRuntimeRepository';

export type DatabaseBackupRetentionStatus = RuntimeBackupRetentionStatus;

const EMPTY_RETENTION_STATUS: DatabaseBackupRetentionStatus = {
  counts: { hourly: 0, daily: 0, weekly: 0, monthly: 0 },
  lastCleanup: null,
  safetyCount: 0,
  totalSizeBytes: 0
};

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export async function loadBackupRetentionStatus(): Promise<DatabaseBackupRetentionStatus> {
  if (!hasSettingsRuntimeRepository()) return EMPTY_RETENTION_STATUS;
  try {
    const value = await loadBackupRetentionStatusFromRuntime();
    if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY_RETENTION_STATUS;
    const payload = value as Record<string, unknown>;
    const counts = payload.counts as Record<string, unknown> | undefined;
    const cleanup = payload.lastCleanup as Record<string, unknown> | null | undefined;
    const readCount = (key: string) => Math.max(0, readNumber(counts?.[key]) ?? 0);
    return {
      counts: {
        hourly: readCount('hourly'),
        daily: readCount('daily'),
        weekly: readCount('weekly'),
        monthly: readCount('monthly')
      },
      lastCleanup: cleanup ? {
        failedCount: Math.max(0, readNumber(cleanup.failedCount) ?? 0),
        movedToTrashCount: Math.max(0, readNumber(cleanup.movedToTrashCount) ?? 0),
        remainingBytesOverLimit: Math.max(0, readNumber(cleanup.remainingBytesOverLimit) ?? 0)
      } : null,
      safetyCount: Math.max(0, readNumber(payload.safetyCount) ?? 0),
      totalSizeBytes: Math.max(0, readNumber(payload.totalSizeBytes) ?? 0)
    };
  } catch {
    return EMPTY_RETENTION_STATUS;
  }
}
