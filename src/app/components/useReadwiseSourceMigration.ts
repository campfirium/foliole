import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import type { ReadwiseSourceMode } from '../../../lib/core/import/importManagerSettings';
import type { NativeReadwiseSourceCutoverFailure } from '../../../lib/platform/nativeReadwiseSourceCutoverContract';
import type { Translate } from '../../shared/localization/LocalizationProvider';
import {
  previewReadwiseSourceCutoverInRuntime,
  runReadwiseSourceCutoverInRuntime
} from '../../shared/platform/import/readwiseSourceCutoverRuntimeRepository';
import {
  onReadwiseReaderImportProgress,
  type ReadwiseReaderImportProgressPayload
} from '../../shared/platform/runtimeShellEvents';
import { requestAppConfirmation } from '../../shared/ui';

export interface ReadwiseMigrationState {
  completedCount: number;
  errorReason: string | null;
  failed: boolean;
  failures?: NativeReadwiseSourceCutoverFailure[];
  phase: 'indexing' | 'merging' | null;
  totalCount: number | null;
}

export function useReadwiseSourceMigration(input: {
  committedMode: ReadwiseSourceMode;
  onCommitMode?: (mode: ReadwiseSourceMode) => void;
  onSelectApi: () => void;
  t: Translate;
}) {
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<ReadwiseMigrationState>({
    completedCount: 0, errorReason: null, failed: false, failures: [], phase: null, totalCount: null
  });
  const [required, setRequired] = useState(false);
  const startingRef = useRef(false);
  const resumeAttemptedRef = useRef(false);
  useMigrationProgressEvents(setProgress);
  const start = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setPending(true);
    resetMigrationProgress(setProgress);
    try {
      const output = await runReadwiseSourceCutoverInRuntime();
      if (output.status === 'completed') await keepCompletedMergeVisible();
      const state = await previewReadwiseSourceCutoverInRuntime();
      const active = state.status === 'migration_in_progress';
      setRequired(active);
      setProgress({
        completedCount: state.completed_count,
        errorReason: output.error_reason ?? state.error_reason,
        failed: active && output.status !== 'completed' && output.status !== 'already_completed',
        failures: state.failed_items ?? [],
        phase: active ? state.phase : null,
        totalCount: active ? state.total_count : null
      });
      if (output.status === 'completed' || output.status === 'already_completed') {
        input.onCommitMode?.('api');
      }
    } catch {
      setRequired(true);
      setProgress((current) => ({ ...current, errorReason: 'request_failed', failed: Boolean(current.phase) }));
    } finally {
      setPending(false);
      startingRef.current = false;
    }
  }, [input.committedMode, input.onCommitMode]);
  useResumeReadwiseMigration(
    input.committedMode, input.onSelectApi, resumeAttemptedRef, setRequired, setProgress
  );
  const selectApi = () => selectReadwiseApi(input);
  const requestStart = (beforeStart: () => Promise<void> | void) =>
    requestReadwiseApiMigration(input.t, beforeStart, start);
  return { ...progress, pending, required, requestStart, selectApi, start };
}

function useMigrationProgressEvents(
  setProgress: Dispatch<SetStateAction<ReadwiseMigrationState>>
) {
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let disposed = false;
    void onReadwiseReaderImportProgress((progress) => applyMigrationProgress(setProgress, progress))
      .then((stop) => { if (disposed) stop?.(); else unsubscribe = stop; })
      .catch(() => undefined);
    return () => { disposed = true; unsubscribe?.(); };
  }, [setProgress]);
}

function resetMigrationProgress(
  setProgress: Dispatch<SetStateAction<ReadwiseMigrationState>>
) {
  setProgress((current) => ({
    ...current, errorReason: null, failed: false,
    failures: []
  }));
}

function applyMigrationProgress(
  setProgress: Dispatch<SetStateAction<ReadwiseMigrationState>>,
  progress: ReadwiseReaderImportProgressPayload
) {
  const phase = progress.phase;
  if (phase !== 'indexing' && phase !== 'merging') return;
  setProgress((current) => {
    const nextCount = migrationCompletedCount(progress);
    return {
      completedCount: nextCount,
      errorReason: null,
      failed: progress.status === 'failed',
      failures: current.failures ?? [],
      phase,
      totalCount: phase === 'merging' ? progress.totalCount : progress.totalCount > 0 ? progress.totalCount : null
    };
  });
}

function keepCompletedMergeVisible() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 750));
}

function migrationCompletedCount(progress: ReadwiseReaderImportProgressPayload) {
  return progress.phase === 'indexing'
    ? progress.sourceProcessedCount ?? progress.processedCount : progress.processedCount;
}

async function selectReadwiseApi(
  input: Parameters<typeof useReadwiseSourceMigration>[0]
) {
  if (!await confirmApiSetup(input.t)) return;
  input.onSelectApi();
}

async function requestReadwiseApiMigration(
  t: Translate,
  beforeStart: () => Promise<void> | void,
  start: (initialTotalCount?: number) => Promise<void>
) {
  const preview = await previewReadwiseSourceCutoverInRuntime();
  if (preview.status !== 'ready' || !await confirmMigration(preview.topic_count, t)) return;
  await beforeStart();
  await start(preview.topic_count);
}

function useResumeReadwiseMigration(
  committedMode: ReadwiseSourceMode,
  onSelectApi: () => void,
  attempted: MutableRefObject<boolean>,
  setRequired: Dispatch<SetStateAction<boolean>>,
  setProgress: Dispatch<SetStateAction<ReadwiseMigrationState>>
) {
  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    void previewReadwiseSourceCutoverInRuntime().then((state) => {
      if (state.status !== 'migration_in_progress' && !state.failed_items?.length) return;
      if (state.status !== 'migration_in_progress') {
        setProgress({
          completedCount: state.completed_count,
          errorReason: state.error_reason,
          failed: false,
          failures: state.failed_items ?? [],
          phase: null,
          totalCount: state.total_count
        });
        return;
      }
      onSelectApi();
      setRequired(true);
      setProgress({
        completedCount: state.completed_count,
        errorReason: state.error_reason,
        failed: Boolean(state.error_reason),
        failures: state.failed_items ?? [],
        phase: state.phase,
        totalCount: state.total_count
      });
    });
  }, [attempted, committedMode, onSelectApi, setProgress, setRequired]);
}

async function confirmMigration(topicCount: number, t: Translate) {
  return requestAppConfirmation({
    cancelLabel: t('shared.confirm.cancel'),
    confirmLabel: t('desktop.readwise.cutover.confirm'),
    description: [
      t('desktop.readwise.cutover.count', { count: topicCount }),
      t('desktop.readwise.cutover.effect'),
      t('desktop.readwise.cutover.experimental')
    ],
    title: t('desktop.readwise.cutover.title')
  });
}

async function confirmApiSetup(t: Translate) {
  return requestAppConfirmation({
    cancelLabel: t('shared.confirm.cancel'),
    confirmLabel: t('desktop.readwise.api.setup.continue'),
    description: [
      t('desktop.readwise.api.setup.description'),
      t('desktop.readwise.api.setup.effect')
    ],
    title: t('desktop.readwise.api.setup.title')
  });
}
