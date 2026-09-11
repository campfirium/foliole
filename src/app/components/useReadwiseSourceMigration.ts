import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import type { ReadwiseSourceMode } from '../../../lib/core/import/importManagerSettings';
import type { Translate } from '../../shared/localization/LocalizationProvider';
import { loadReadwiseApiConnectionFromRuntime } from '../../shared/platform/import/readwiseApiConnectionRuntimeRepository';
import {
  previewReadwiseSourceCutoverInRuntime,
  runReadwiseSourceCutoverInRuntime
} from '../../shared/platform/import/readwiseSourceCutoverRuntimeRepository';
import { onReadwiseReaderImportProgress } from '../../shared/platform/runtimeShellEvents';
import { requestAppConfirmation } from '../../shared/ui';

export interface ReadwiseMigrationState {
  completedCount: number;
  errorReason: string | null;
  failed: boolean;
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
    completedCount: 0, errorReason: null, failed: false, phase: null, totalCount: null
  });
  const [required, setRequired] = useState(false);
  const startingRef = useRef(false);
  const resumeAttemptedRef = useRef(false);
  const start = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setPending(true);
    setProgress((current) => ({ ...current, errorReason: null, failed: false }));
    let unsubscribe: (() => void) | null = null;
    try {
      try {
        unsubscribe = await onReadwiseReaderImportProgress((progress) => {
          if (progress.phase !== 'indexing' && progress.phase !== 'merging') return;
          setProgress({
            completedCount: progress.processedCount,
            errorReason: null,
            failed: progress.status === 'failed',
            phase: progress.phase,
            totalCount: progress.phase === 'indexing' ? null : progress.totalCount
          });
        });
      } catch { unsubscribe = null; }
      const output = await runReadwiseSourceCutoverInRuntime();
      const state = await previewReadwiseSourceCutoverInRuntime();
      const active = state.status === 'migration_in_progress';
      setRequired(active);
      setProgress({
        completedCount: state.completed_count,
        errorReason: output.error_reason ?? state.error_reason,
        failed: active && output.status === 'failed',
        phase: active ? state.phase : null,
        totalCount: active ? state.total_count : null
      });
      if (state.status === 'migration_in_progress' || output.status === 'completed' || output.status === 'already_completed') {
        input.onCommitMode?.('api');
      }
    } catch {
      setRequired(true);
      setProgress((current) => ({ ...current, errorReason: 'request_failed', failed: Boolean(current.phase) }));
    } finally {
      unsubscribe?.();
      setPending(false);
      startingRef.current = false;
    }
  }, [input.onCommitMode]);
  useResumeReadwiseMigration(input.committedMode, resumeAttemptedRef, setRequired, setProgress, start);
  const selectApi = () => selectReadwiseApi(input, setRequired, setProgress, start);
  return { ...progress, pending, required, selectApi, start };
}

async function selectReadwiseApi(
  input: Parameters<typeof useReadwiseSourceMigration>[0],
  setRequired: Dispatch<SetStateAction<boolean>>,
  setProgress: Dispatch<SetStateAction<ReadwiseMigrationState>>,
  start: () => Promise<void>
) {
  const preview = await previewReadwiseSourceCutoverInRuntime();
  if (preview.status !== 'ready' || !await confirmMigration(preview.topic_count, input.t)) return;
  input.onSelectApi();
  setRequired(true);
  setProgress({ completedCount: 0, errorReason: null, failed: false, phase: null, totalCount: null });
  if ((await loadReadwiseApiConnectionFromRuntime()).state === 'connected') void start();
}

function useResumeReadwiseMigration(
  committedMode: ReadwiseSourceMode,
  attempted: MutableRefObject<boolean>,
  setRequired: Dispatch<SetStateAction<boolean>>,
  setProgress: Dispatch<SetStateAction<ReadwiseMigrationState>>,
  start: () => Promise<void>
) {
  useEffect(() => {
    if (committedMode !== 'api' || attempted.current) return;
    attempted.current = true;
    void previewReadwiseSourceCutoverInRuntime().then((state) => {
      if (state.status !== 'migration_in_progress') return;
      setRequired(true);
      setProgress({
        completedCount: state.completed_count,
        errorReason: state.error_reason,
        failed: Boolean(state.error_reason),
        phase: state.phase,
        totalCount: state.total_count
      });
      void start();
    });
  }, [attempted, committedMode, setProgress, setRequired, start]);
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
