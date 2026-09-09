import { useCallback, useEffect, useRef, useState } from 'react';

import type { ReadwiseSourceMode } from '../../../lib/core/import/importManagerSettings';
import type { Translate } from '../../shared/localization/LocalizationProvider';
import { loadReadwiseApiConnectionFromRuntime } from '../../shared/platform/import/readwiseApiConnectionRuntimeRepository';
import {
  previewReadwiseSourceCutoverInRuntime,
  runReadwiseSourceCutoverInRuntime
} from '../../shared/platform/import/readwiseSourceCutoverRuntimeRepository';
import { onReadwiseReaderImportProgress } from '../../shared/platform/runtimeShellEvents';
import { requestAppConfirmation } from '../../shared/ui';

export function useReadwiseSourceMigration(input: {
  committedMode: ReadwiseSourceMode;
  onCommitMode?: (mode: ReadwiseSourceMode) => void;
  onSelectApi: () => void;
  t: Translate;
}) {
  const [pending, setPending] = useState(false);
  const [percent, setPercent] = useState(0);
  const [required, setRequired] = useState(false);
  const startingRef = useRef(false);
  const resumeAttemptedRef = useRef(false);
  const start = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setPending(true);
    let unsubscribe: (() => void) | null = null;
    try {
      try {
        unsubscribe = await onReadwiseReaderImportProgress((progress) => {
          setPercent(progress.totalCount > 0
            ? Math.floor((progress.processedCount / progress.totalCount) * 100) : 0);
        });
      } catch { unsubscribe = null; }
      const output = await runReadwiseSourceCutoverInRuntime();
      const state = await previewReadwiseSourceCutoverInRuntime();
      setRequired(state.status === 'migration_in_progress');
      if (state.status === 'migration_in_progress' || output.status === 'completed' || output.status === 'already_completed') {
        input.onCommitMode?.('api');
      }
      if (output.status === 'completed' || output.status === 'already_completed') setPercent(100);
    } catch {
      setRequired(true);
    } finally {
      unsubscribe?.();
      setPending(false);
      startingRef.current = false;
    }
  }, [input.onCommitMode]);
  useEffect(() => {
    if (input.committedMode !== 'api' || resumeAttemptedRef.current) return;
    resumeAttemptedRef.current = true;
    void previewReadwiseSourceCutoverInRuntime().then((state) => {
      if (state.status !== 'migration_in_progress') return;
      setRequired(true);
      setPercent(state.total_count && state.total_count > 0
        ? Math.floor((state.completed_count / state.total_count) * 100) : 0);
      void start();
    });
  }, [input.committedMode, start]);
  async function selectApi() {
    const preview = await previewReadwiseSourceCutoverInRuntime();
    if (preview.status !== 'ready' || !await confirmMigration(preview.topic_count, input.t)) return;
    input.onSelectApi();
    setRequired(true);
    if ((await loadReadwiseApiConnectionFromRuntime()).state === 'connected') void start();
  }
  return { pending, percent, required, selectApi, start };
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
