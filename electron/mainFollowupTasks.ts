import { reconcileAutomaticDatabaseBackups } from './database/backupRestore.js';
import { resumePendingPdfAttachmentIndexing } from './database/pdfIndexing.js';
import { startSearchIndexInvalidationScheduler } from './database/searchIndexInvalidationScheduler.js';
import { startDesktopTaskWatchdog } from './desktopTaskWatchdog.js';
import { startExternalSearchBackgroundRefresh } from './externalSearchBackgroundRefreshRuntime.js';
import { startKeepImportMonitor } from './import/keepImportMonitor.js';
import { startManagedInboxMonitor } from './import/managedInboxMonitor.js';
import { appendBootEvent } from './ipc/boot.js';
import { migrateLegacyWebviewStorage } from './ipc/legacyWebviewStorage.js';
import { backfillMissingMirrorOutput } from './mirror/rebuildMirrorOutput.js';
import { runStartupTask } from './startupTasks.js';

let watchdogStarted = false;

function ensureDesktopTaskWatchdog() {
  if (watchdogStarted) {
    return;
  }
  watchdogStarted = true;
  startDesktopTaskWatchdog();
}

export function startFollowupTasks() {
  ensureDesktopTaskWatchdog();
  runStartupTask('[backup] automatic backup reconcile failed', () => reconcileAutomaticDatabaseBackups(), {
    cancellable: false,
    cost: 'medium',
    progress: 'none'
  });
  runStartupTask('[mirror] startup backfill failed', backfillMissingMirrorOutput, {
    cancellable: true,
    cost: 'heavy',
    progress: 'incremental'
  });
  runStartupTask('[storage] legacy webview migration failed', () => migrateLegacyWebviewStorage(), {
    cancellable: false,
    cost: 'medium',
    progress: 'none'
  });
  runStartupTask('[pdf] pending indexing resume failed', resumePendingPdfAttachmentIndexing, {
    cancellable: false,
    cost: 'light',
    progress: 'none'
  });
  runStartupTask('[search] invalidation scheduler failed', startSearchIndexInvalidationScheduler, {
    cancellable: false,
    cost: 'light',
    progress: 'none'
  });
  void appendBootEvent('startup_followup_tasks_started');
  runStartupTask('[managed-inbox] startup monitor failed', startManagedInboxMonitor, {
    cancellable: false,
    cost: 'light',
    progress: 'none'
  });
  runStartupTask('[keep-import] startup monitor failed', startKeepImportMonitor, {
    cancellable: false,
    cost: 'light',
    progress: 'none'
  });
  runStartupTask('[external-search] background refresh scheduler failed', startExternalSearchBackgroundRefresh, {
    cancellable: false,
    cost: 'light',
    progress: 'none'
  });
}
