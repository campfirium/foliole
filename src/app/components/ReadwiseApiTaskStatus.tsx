import { useEffect, useState } from 'react';

import type { NativeReadwiseApiScheduleStatus } from '../../../lib/platform/nativeReadwiseApiImportContract';
import type { Translate } from '../../shared/localization/LocalizationProvider';
import { loadReadwiseApiScheduleStatusInRuntime } from '../../shared/platform/readwiseReaderImportRuntimeRepository';
import { onWorkspaceContentChanged } from '../../shared/platform/runtimeShellEvents';

export function useReadwiseApiTaskStatus(refreshKey: boolean) {
  const [status, setStatus] = useState<NativeReadwiseApiScheduleStatus | null>(null);
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;
    const refresh = () => void loadReadwiseApiScheduleStatusInRuntime().then((value) => {
      if (active && value) setStatus(value);
    });
    refresh();
    void onWorkspaceContentChanged(refresh).then((value) => { unsubscribe = value; });
    return () => { active = false; unsubscribe?.(); };
  }, [refreshKey]);
  return status;
}

export function readwiseApiTaskPresentation(status: NativeReadwiseApiScheduleStatus | null, t: Translate) {
  const initial = status?.initial_sync;
  const failed = initial?.failed_count ?? 0;
  const running = initial?.status === 'running' || status?.routine_sync?.lifecycle?.status === 'running';
  return {
    actionLabel: failed > 0
      ? t('desktop.readwise.api.tasks.retryFailed', { count: failed })
      : !initial || initial.status === 'completed'
        ? t('desktop.readwise.sync.action')
        : t('desktop.readwise.api.tasks.continueInitial'),
    initial: initialCopy(status, t),
    loadingLabel: t('desktop.readwise.sync.running'),
    routine: routineCopy(status, t),
    running
  };
}

function initialCopy(status: NativeReadwiseApiScheduleStatus | null, t: Translate) {
  const initial = status?.initial_sync;
  if (!initial) return null;
  if (initial.status === 'completed') return t('desktop.readwise.api.tasks.initialCompleted', {
    completed: initial.completed_count, total: initial.total_count ?? initial.completed_count
  });
  if (initial.total_count === null) return t('desktop.readwise.api.tasks.initialPending');
  const progress = t('desktop.readwise.api.tasks.initialProgress', {
    completed: initial.completed_count, failed: initial.failed_count, total: initial.total_count
  });
  return initial.unexplained_failure_count > 0
    ? `${progress} ${t('desktop.readwise.api.tasks.reasonMissing')}` : progress;
}

function routineCopy(status: NativeReadwiseApiScheduleStatus | null, t: Translate) {
  if (!status) return null;
  if (status.initial_sync.status !== 'completed') return t('desktop.readwise.api.tasks.routineBlocked');
  const lifecycle = status.routine_sync.lifecycle;
  if (lifecycle?.status === 'running') return t('desktop.readwise.api.tasks.routineRunning');
  if (lifecycle?.status === 'failed') return t('desktop.readwise.api.tasks.routineFailed');
  if (lifecycle?.status === 'interrupted') return t('desktop.readwise.api.tasks.routineInterrupted');
  if (status.routine_sync.last_result?.status === 'completed') {
    return t('desktop.readwise.api.tasks.routineCompleted');
  }
  return t('desktop.readwise.api.tasks.routinePending');
}
