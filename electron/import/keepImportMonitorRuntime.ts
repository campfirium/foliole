import { loadExecutableImportManagerSettings } from './importManagerSettings.js';
import { createKeepImportMonitor, type KeepImportMonitorDeps } from './keepImportMonitor.js';
import { runKeepImportRule } from './keepImportService.js';
import { watchKeepImportDirectory } from './keepImportWatch.js';
import { assertReadwiseExecutionEnabled } from './readwiseDeviceSettings.js';
import { assertLocalWatchedFolderExecution } from './watchedFolderExecutionGate.js';

function createDefaultKeepImportMonitorDeps(): KeepImportMonitorDeps {
  return {
    debounceMs: 250,
    loadSettings() {
      const settings = loadExecutableImportManagerSettings();
      return {
        ...settings,
        sources: settings.sources.filter((source) =>
          source.ownership?.editable === true && source.keepState === 'enabled'
        )
      };
    },
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
      if (config.sourceType === 'generic') {
        assertLocalWatchedFolderExecution(config.sourceId, { requireEnabled: true });
      } else {
        assertReadwiseExecutionEnabled();
      }
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
