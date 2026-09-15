import { useCallback, useEffect, useRef, useState } from 'react';

import {
  previewReadwiseSourceCutoverInRuntime,
  runReadwiseSourceCutoverInRuntime
} from '../../shared/platform/import/readwiseSourceCutoverRuntimeRepository';
import {
  loadImportSourceWorkspaceSettings,
  saveImportSourceWorkspaceSettings
} from '../components/importSourceWorkspaceSettings';

export function useReadwiseMigrationRecovery(enabled: boolean) {
  const runningRef = useRef(false);
  const [waitingForNetwork, setWaitingForNetwork] = useState(false);
  const attempt = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      const preview = await previewReadwiseSourceCutoverInRuntime();
      if (preview.status === 'already_completed') {
        await commitApiMode();
        setWaitingForNetwork(false);
        return;
      }
      if (preview.status !== 'migration_in_progress') {
        setWaitingForNetwork(false);
        return;
      }
      if (!navigator.onLine) {
        setWaitingForNetwork(true);
        return;
      }
      setWaitingForNetwork(false);
      const result = await runReadwiseSourceCutoverInRuntime();
      if (result.status === 'completed' || result.status === 'already_completed') {
        await commitApiMode();
      }
      setWaitingForNetwork(
        result.status === 'failed' && result.error_reason === 'request_failed'
      );
    } catch {
      setWaitingForNetwork(!navigator.onLine);
    } finally {
      runningRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    return scheduleIdleRecovery(attempt);
  }, [attempt, enabled]);

  useEffect(() => {
    if (!enabled || !waitingForNetwork) return;
    const resume = () => void attempt();
    window.addEventListener('online', resume, { once: true });
    return () => window.removeEventListener('online', resume);
  }, [attempt, enabled, waitingForNetwork]);
}

async function commitApiMode() {
  const settings = await loadImportSourceWorkspaceSettings();
  if (settings.readwiseSourceMode === 'api') return;
  await saveImportSourceWorkspaceSettings({
    ...settings,
    readwiseSourceMode: 'api',
    readwiseSourceModeConflict: []
  });
}

function scheduleIdleRecovery(task: () => Promise<void>) {
  const id = window.setTimeout(() => void task(), 800);
  return () => window.clearTimeout(id);
}
