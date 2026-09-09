import type {
  NativeReadwiseApiRunKind,
  NativeReadwiseApiRunLifecycle,
  NativeReadwiseApiTaskProgress,
  NativeReadwiseApiRunStage,
  NativeReadwiseApiRunTrigger,
  NativeReadwiseApiScheduleResult
} from '../../lib/platform/nativeReadwiseApiImportContract.js';

export function normalizeReadwiseApiRunLifecycle(value: unknown): NativeReadwiseApiRunLifecycle | null {
  if (!isRecord(value)) return null;
  const kinds = ['initial', 'routine'];
  const statuses = ['completed', 'failed', 'interrupted', 'queued', 'running'];
  const triggers = ['manual', 'scheduled', 'startup'];
  const stages = ['eligibility', 'fetching', 'writing', 'completion'];
  if (!kinds.includes(String(value.kind)) || !statuses.includes(String(value.status))
    || !triggers.includes(String(value.trigger)) || !stages.includes(String(value.stage))) return null;
  if (typeof value.run_id !== 'string' || typeof value.queued_at !== 'string') return null;
  return {
    error_reason: typeof value.error_reason === 'string' ? value.error_reason : null,
    finished_at: typeof value.finished_at === 'string' ? value.finished_at : null,
    kind: value.kind as NativeReadwiseApiRunKind,
    progress: normalizeReadwiseApiTaskProgress(value.progress),
    queued_at: value.queued_at,
    run_id: value.run_id,
    stage: value.stage as NativeReadwiseApiRunStage,
    started_at: typeof value.started_at === 'string' ? value.started_at : null,
    status: value.status as NativeReadwiseApiRunLifecycle['status'],
    trigger: value.trigger as NativeReadwiseApiRunTrigger
  };
}

export function normalizeReadwiseApiScheduleResult(value: unknown): NativeReadwiseApiScheduleResult | null {
  if (!isRecord(value)) return null;
  const statuses = ['cancelled', 'completed', 'failed', 'paused'];
  const triggers = ['manual', 'scheduled', 'startup'];
  const stages = ['eligibility', 'fetching', 'writing', 'completion'];
  if (!statuses.includes(String(value.status)) || !triggers.includes(String(value.trigger))) return null;
  return {
    completed_at: typeof value.completed_at === 'string' ? value.completed_at : new Date(0).toISOString(),
    error_stage: stages.includes(String(value.error_stage)) ? value.error_stage as NativeReadwiseApiRunStage : null,
    imported_count: typeof value.imported_count === 'number' ? value.imported_count : 0,
    status: value.status as NativeReadwiseApiScheduleResult['status'],
    trigger: value.trigger as NativeReadwiseApiRunTrigger
  };
}

export function normalizeReadwiseApiTaskProgress(value: unknown): NativeReadwiseApiTaskProgress | null {
  if (!isRecord(value)) return null;
  const keys = ['completed_count', 'failed_count', 'pending_count', 'unexplained_failure_count'] as const;
  if (keys.some((key) => typeof value[key] !== 'number')) return null;
  return {
    completed_count: Number(value.completed_count),
    failed_count: Number(value.failed_count),
    pending_count: Number(value.pending_count),
    total_count: typeof value.total_count === 'number' ? value.total_count : null,
    unexplained_failure_count: Number(value.unexplained_failure_count)
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
