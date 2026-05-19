import { loadImportManagerSettings } from './importManagerSettings.js';
import { createKeepImportMonitor, type KeepImportMonitorDeps } from './keepImportMonitor.js';
import { runKeepImportRule } from './keepImportService.js';
import { watchKeepImportDirectory } from './keepImportWatch.js';

function createDefaultKeepImportMonitorDeps(): KeepImportMonitorDeps {
  return {
    debounceMs: 250,
    loadSettings: loadImportManagerSettings,
    logError(message, error) {
      console.error(message, error);
    },
    async runCycle(config) {
      await runKeepImportRule({
        directoryPath: config.directoryPath,
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
