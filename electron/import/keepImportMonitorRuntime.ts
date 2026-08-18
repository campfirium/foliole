import { canCurrentDeviceRunReadwise } from '../database/readwiseDeviceAssignment.js';
import { resolveExecutableWatchedBinding } from '../database/watchedFolderBindings.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { createKeepImportMonitor, type KeepImportMonitorDeps } from './keepImportMonitor.js';
import { runKeepImportRule } from './keepImportService.js';
import { watchKeepImportDirectory } from './keepImportWatch.js';

function createDefaultKeepImportMonitorDeps(): KeepImportMonitorDeps {
  return {
    canRunConfig(config) {
      return config.sourceType === 'readwise'
        ? canCurrentDeviceRunReadwise()
        : resolveExecutableWatchedBinding(config.sourceId, config.directoryPath).executable;
    },
    debounceMs: 250,
    loadSettings: loadImportManagerSettings,
    logError(message, error) {
      console.error(message, error);
    },
    logMissingDirectory(config, missingPaths) {
      console.warn('[keep-import] source directories missing', {
        missingPaths,
        sourceId: config.sourceId,
        sourceType: config.sourceType
      });
    },
    async runCycle(config) {
      await runKeepImportRule({
        actionMode: config.actionMode,
        directoryPath: config.directoryPath,
        ...(config.highlightDirectoryPath ? { highlightDirectoryPath: config.highlightDirectoryPath } : {}),
        highlightMode: config.highlightMode,
        highlightPolicy: config.highlightPolicy,
        ruleId: config.adapterConfigId,
        sourceType: config.sourceType
      });
    },
    watch: watchKeepImportDirectory
  };
}

const keepImportMonitor = createKeepImportMonitor(createDefaultKeepImportMonitorDeps());

export async function startKeepImportMonitor() {
  await keepImportMonitor.start();
}

export async function refreshKeepImportMonitorFromSettings() {
  await keepImportMonitor.refreshFromSettings();
}

export function isKeepImportMonitorSnapshotFresh(ruleId: string) {
  return keepImportMonitor.isSnapshotFresh(ruleId);
}

export function stopKeepImportMonitor() {
  keepImportMonitor.stop();
}
