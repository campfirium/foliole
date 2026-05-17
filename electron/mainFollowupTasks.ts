import { reconcileAutomaticDatabaseBackups } from './database/backupRestore.js';
import { resumePendingPdfAttachmentIndexing } from './database/pdfIndexing.js';
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
  runStartupTask('[backup] automatic backup reconcile failed', () => reconcileAutomaticDatabaseBackups());
  runStartupTask('[mirror] startup backfill failed', backfillMissingMirrorOutput);
  runStartupTask('[storage] legacy webview migration failed', () => migrateLegacyWebviewStorage());
  runStartupTask('[pdf] pending indexing resume failed', resumePendingPdfAttachmentIndexing);
  void appendBootEvent('startup_followup_tasks_started');
  runStartupTask('[managed-inbox] startup monitor failed', startManagedInboxMonitor);
  runStartupTask('[keep-import] startup monitor failed', startKeepImportMonitor);
  runStartupTask('[external-search] background refresh scheduler failed', startExternalSearchBackgroundRefresh);
}
