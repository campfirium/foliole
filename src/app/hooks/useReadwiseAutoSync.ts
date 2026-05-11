import { useEffect } from 'react';

import type { ImportManagerSettings } from '../../../lib/core/import/importManagerSettings';
import {
  isReadwiseReaderConfigReady,
  type ReadwiseSyncFrequency
} from '../../../lib/core/import/readwiseReaderSettings';
import { runReadwiseReaderImportInRuntime } from '../../shared/platform/readwiseReaderImportRuntimeRepository';
import {
  IMPORT_SOURCE_WORKSPACE_SETTINGS_CHANGED_EVENT,
  loadImportSourceWorkspaceSettings
} from '../components/importSourceWorkspaceSettings';

const SYNC_INTERVAL_MS: Record<ReadwiseSyncFrequency, number> = {
  daily: 24 * 60 * 60 * 1000,
  every_12_hours: 12 * 60 * 60 * 1000,
  hourly: 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000
};

function canRunReadwiseAutoSync(settings: ImportManagerSettings) {
  return (
    settings.readwiseReaderConfig.enabled &&
    settings.readwiseRootPath.trim().length > 0 &&
    isReadwiseReaderConfigReady(settings.readwiseReaderConfig)
  );
}

export function resolveReadwiseAutoSyncIntervalMs(frequency: ReadwiseSyncFrequency) {
  return SYNC_INTERVAL_MS[frequency];
}

export function useReadwiseAutoSync() {
  useEffect(() => {
    let disposed = false;
    let timerId: number | null = null;
    let running = false;

    function clearTimer() {
      if (timerId !== null) {
        window.clearTimeout(timerId);
        timerId = null;
      }
    }

    function scheduleNext(settings: ImportManagerSettings) {
      clearTimer();
      timerId = window.setTimeout(
        () => void runScheduledSync(),
        resolveReadwiseAutoSyncIntervalMs(settings.readwiseReaderConfig.syncFrequency)
      );
    }

    async function refreshSchedule() {
      scheduleNext(await loadImportSourceWorkspaceSettings());
    }

    async function runScheduledSync() {
      if (disposed || running) {
        return;
      }
      running = true;
      let settings: ImportManagerSettings | null = null;
      try {
        settings = await loadImportSourceWorkspaceSettings();
        if (canRunReadwiseAutoSync(settings)) {
          await runReadwiseReaderImportInRuntime(settings);
        }
      } catch {
        // Auto sync should not stop future scheduled scans after one failed run.
      } finally {
        if (!disposed && settings) {
          scheduleNext(settings);
        }
        running = false;
      }
    }

    function handleSettingsChanged(event: Event) {
      const detail = (event as CustomEvent<ImportManagerSettings>).detail;
      if (detail) {
        scheduleNext(detail);
      } else {
        void refreshSchedule();
      }
    }

    void refreshSchedule();
    window.addEventListener(IMPORT_SOURCE_WORKSPACE_SETTINGS_CHANGED_EVENT, handleSettingsChanged);
    return () => {
      disposed = true;
      clearTimer();
      window.removeEventListener(
        IMPORT_SOURCE_WORKSPACE_SETTINGS_CHANGED_EVENT,
        handleSettingsChanged
      );
    };
  }, []);
}
