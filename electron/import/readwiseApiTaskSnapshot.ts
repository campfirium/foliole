import {
  readwiseSourceCutoverProgress,
  type StoredReadwiseSourceCutover
} from '../../lib/core/readwise/readwiseSourceCutover.js';
import type {
  NativeReadwiseApiRunLifecycle,
  NativeReadwiseApiScheduleResult,
  NativeReadwiseApiScheduleStatus,
  NativeReadwiseApiTaskProgress
} from '../../lib/platform/nativeReadwiseApiImportContract.js';

interface CandidateProgress {
  completedCount: number;
  failedCount: number;
  pendingCount: number;
  totalCount: number;
  unexplainedFailureCount: number;
}

export function buildReadwiseApiTaskSnapshot(input: {
  candidateProgress: CandidateProgress | null;
  completedThrough: string | null;
  cutover: StoredReadwiseSourceCutover | null;
  eligibility: NativeReadwiseApiScheduleStatus['eligibility'];
  initialProgress: NativeReadwiseApiTaskProgress | null;
  lastResult: NativeReadwiseApiScheduleResult | null;
  lifecycle: NativeReadwiseApiRunLifecycle | null;
  nextRunAt: string | null;
  workerOwned: boolean;
}): NativeReadwiseApiScheduleStatus {
  const lifecycle = projectLifecycle(input.lifecycle, input.workerOwned);
  return {
    cutover: cutoverStatus(input.cutover),
    eligibility: input.eligibility,
    initial_sync: initialSyncStatus(
      input.candidateProgress, input.initialProgress, input.completedThrough, lifecycle
    ),
    routine_sync: {
      last_result: input.lastResult,
      lifecycle: lifecycle?.kind === 'routine' ? lifecycle : null,
      next_run_at: input.eligibility === 'ready' ? input.nextRunAt : null
    }
  };
}

function initialSyncStatus(
  progress: CandidateProgress | null,
  storedProgress: NativeReadwiseApiTaskProgress | null,
  completedThrough: string | null,
  lifecycle: NativeReadwiseApiRunLifecycle | null
): NativeReadwiseApiScheduleStatus['initial_sync'] {
  const lifecycleProgress = lifecycle?.kind === 'initial' ? lifecycle.progress : null;
  const durableProgress = storedProgress ?? lifecycleProgress;
  const effectiveProgress = progress?.totalCount ? progress : durableProgress ? {
    completedCount: durableProgress.completed_count,
    failedCount: durableProgress.failed_count,
    pendingCount: durableProgress.pending_count,
    totalCount: durableProgress.total_count ?? 0,
    unexplainedFailureCount: durableProgress.unexplained_failure_count
  } : progress;
  if (!effectiveProgress) return {
    completed_count: 0, failed_count: 0, lifecycle: null,
    pending_count: 0, status: 'pending', total_count: null, unexplained_failure_count: 0
  };
  const initialLifecycle = lifecycle?.kind === 'initial' ? lifecycle : null;
  return {
    completed_count: effectiveProgress.completedCount,
    failed_count: effectiveProgress.failedCount,
    lifecycle: initialLifecycle,
    pending_count: effectiveProgress.pendingCount,
    status: completedThrough ? 'completed'
      : initialLifecycle?.status ?? (effectiveProgress.failedCount > 0 ? 'failed' : 'pending'),
    total_count: effectiveProgress.totalCount || null,
    unexplained_failure_count: effectiveProgress.unexplainedFailureCount
  };
}

function cutoverStatus(state: StoredReadwiseSourceCutover | null): NativeReadwiseApiScheduleStatus['cutover'] {
  if (!state) return {
    completed_count: 0, failed_count: 0, pending_count: 0, status: 'not_started',
    total_count: null, unexplained_failure_count: 0
  };
  const progress = readwiseSourceCutoverProgress(state);
  const total = progress.totalCandidateCount;
  const completed = progress.completedCandidateCount;
  return {
    completed_count: completed,
    failed_count: 0,
    pending_count: total === null ? 0 : Math.max(0, total - completed),
    status: state.status === 'api' ? 'completed' : 'in_progress',
    total_count: total,
    unexplained_failure_count: 0
  };
}

function projectLifecycle(lifecycle: NativeReadwiseApiRunLifecycle | null, workerOwned: boolean) {
  if (!lifecycle || lifecycle.status !== 'running' || workerOwned) return lifecycle;
  return { ...lifecycle, status: 'interrupted' as const };
}
