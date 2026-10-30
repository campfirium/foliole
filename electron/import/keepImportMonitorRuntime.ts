import { syncGroupLocalPublicationBlockReason } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { canCurrentHostRunReadwise } from '../database/readwiseHostAssignment.js';
import { resolveExecutableWatchedBinding } from '../database/watchedFolderBindings.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { createKeepImportMonitor, type KeepImportMonitorDeps } from './keepImportMonitor.js';
import { runKeepImportRule } from './keepImportService.js';
import { watchKeepImportDirectory } from './keepImportWatch.js';

function createDefaultKeepImportMonitorDeps(): KeepImportMonitorDeps {
  return {
    canRunConfig(config) {
      return config.sourceType === 'readwise'
        ? canCurrentHostRunReadwise('relay')
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
let requested = false;
let suspended = false;

function reconcileKeepImportMonitor(start: boolean) {
  return runWithDatabaseConnectionOwner(async () => {
    if (!requested) return;
    const blocked = await syncGroupLocalPublicationBlockReason(
      createBetterSqliteDbPort(openDatabaseConnection().sqlite)
    );
    if (!requested) return;
    if (blocked) {
      keepImportMonitor.stop();
      suspended = true;
      return;
    }
    if (start || suspended) {
      suspended = false;
      await keepImportMonitor.start();
    } else await keepImportMonitor.refreshFromSettings();
  });
}

export async function startKeepImportMonitor() {
  requested = true;
  await reconcileKeepImportMonitor(true);
}

export async function refreshKeepImportMonitorFromSettings() {
  await reconcileKeepImportMonitor(false);
}

export function isKeepImportMonitorSnapshotFresh(ruleId: string) {
  return keepImportMonitor.isSnapshotFresh(ruleId);
}

export function stopKeepImportMonitor() {
  requested = false;
  suspended = false;
  keepImportMonitor.stop();
}
