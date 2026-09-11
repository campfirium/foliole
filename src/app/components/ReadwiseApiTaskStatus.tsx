import { useEffect, useState } from 'react';

import type {
  NativeReadwiseApiRunLifecycle,
  NativeReadwiseApiScheduleStatus
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
    loadingLabel: t('desktop.readwise.sync.action'),
    running: Boolean(lifecycle)
  };
}

export function readwiseApiPhasePresentation(
  status: NativeReadwiseApiScheduleStatus | null,
  t: Translate
) {
  const lifecycle = currentLifecycle(status);
  if (!lifecycle || lifecycle.status === 'completed' || lifecycle.status === 'queued'
    || lifecycle.stage === 'eligibility') return null;
  const phaseKey = lifecycle.stage === 'fetching'
    ? 'desktop.readwise.api.tasks.indexing'
    : 'desktop.readwise.api.tasks.syncing';
  const phase = t(phaseKey);
  if (lifecycle.status !== 'failed') return { failed: false, text: phase };
  const failedKey = lifecycle.stage === 'fetching'
    ? 'desktop.readwise.api.tasks.indexFailed'
    : 'desktop.readwise.api.tasks.syncFailed';
  const reason = readwiseFailureReason(lifecycle.error_reason, t);
  return { failed: true, text: reason ? `${t(failedKey)} · ${reason}` : t(failedKey) };
}

function activeLifecycle(status: NativeReadwiseApiScheduleStatus | null) {
  const initial = status?.initial_sync.lifecycle;
  if (initial?.status === 'running') return initial;
  const routine = status?.routine_sync.lifecycle;
  return routine?.status === 'running' ? routine : null;
}

function currentLifecycle(status: NativeReadwiseApiScheduleStatus | null): NativeReadwiseApiRunLifecycle | null {
  return status?.initial_sync.lifecycle ?? status?.routine_sync.lifecycle ?? null;
}

export function readwiseFailureReason(reason: string | null, t: Translate) {
  const key = {
    rate_limited: 'desktop.readwise.api.failure.rateLimited',
    readwise_api_reconnect_required: 'desktop.readwise.api.failure.reconnectRequired',
    readwise_execution_connection_changed: 'desktop.readwise.api.failure.connectionChanged',
    readwise_execution_eligibility_lost: 'desktop.readwise.api.failure.notEligible',
    request_failed: 'desktop.readwise.api.failure.requestFailed'
  }[reason ?? ''] as Parameters<Translate>[0] | undefined;
  return key ? t(key) : null;
}
