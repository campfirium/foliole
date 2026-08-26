export const SYNC_TRIGGER_REASONS = ['initial', 'automatic', 'manual'] as const;

export type SyncTriggerReason = (typeof SYNC_TRIGGER_REASONS)[number];
export type SyncTriggerStatus = 'completed' | 'failed' | 'skipped';

export interface SyncTriggerResult {
  error: string | null;
  finished_at: string;
  reason: SyncTriggerReason;
  run_id: string;
  started_at: string;
  status: SyncTriggerStatus;
}

export function isSyncTriggerReason(value: unknown): value is SyncTriggerReason {
  return typeof value === 'string' && SYNC_TRIGGER_REASONS.includes(value as SyncTriggerReason);
}

export function syncTriggerError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
