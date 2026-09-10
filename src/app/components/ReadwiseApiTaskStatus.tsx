import { useEffect, useState } from 'react';

import type {
  NativeReadwiseApiScheduleStatus,
  NativeReadwiseApiTaskProgress
} from '../../../lib/platform/nativeReadwiseApiImportContract';
import type { Translate } from '../../shared/localization/LocalizationProvider';
import { loadReadwiseApiScheduleStatusInRuntime } from '../../shared/platform/readwiseReaderImportRuntimeRepository';
import {
  onReadwiseReaderImportProgress,
  onWorkspaceContentChanged
} from '../../shared/platform/runtimeShellEvents';

export function useReadwiseApiTaskStatus(refreshKey: boolean) {
  const [status, setStatus] = useState<NativeReadwiseApiScheduleStatus | null>(null);
  useEffect(() => {
    let active = true;
    const unsubscribers: Array<() => void> = [];
    const refresh = () => void loadReadwiseApiScheduleStatusInRuntime().then((value) => {
      if (active && value) setStatus(value);
    });
    const attach = (subscription: Promise<(() => void) | null>) => void subscription.then((unsubscribe) => {
      if (!unsubscribe) return;
      if (active) unsubscribers.push(unsubscribe);
      else unsubscribe();
    });
    refresh();
    attach(onReadwiseReaderImportProgress(refresh));
    attach(onWorkspaceContentChanged(refresh));
    return () => { active = false; unsubscribers.forEach((unsubscribe) => unsubscribe()); };
  }, [refreshKey]);
  return status;
}

export function readwiseApiTaskPresentation(status: NativeReadwiseApiScheduleStatus | null, t: Translate) {
  const lifecycle = activeLifecycle(status);
  return {
    actionLabel: t('desktop.readwise.sync.action'),
    loadingLabel: runningLabel(lifecycle?.progress ?? null, t),
    running: Boolean(lifecycle)
  };
}

function activeLifecycle(status: NativeReadwiseApiScheduleStatus | null) {
  const initial = status?.initial_sync.lifecycle;
  if (initial?.status === 'running') return initial;
  const routine = status?.routine_sync.lifecycle;
  return routine?.status === 'running' ? routine : null;
}

function runningLabel(
  progress: NativeReadwiseApiTaskProgress | null,
  t: Translate
) {
  if (!progress || progress.total_count === null) return t('desktop.readwise.api.tasks.running');
  return t('desktop.readwise.api.tasks.runningProgress', {
    completed: progress.completed_count,
    total: progress.total_count
  });
}
