import { reconcileAutomaticDatabaseBackups } from './database/backupRestore.js';
import { resumePendingPdfAttachmentIndexing } from './database/pdfIndexing.js';
import { startSearchIndexInvalidationScheduler } from './database/searchIndexInvalidationScheduler.js';
import { submitDesktopOperation } from './desktopOperations.js';
import { startDesktopTaskWatchdog } from './desktopTaskWatchdog.js';
import { startExternalSearchBackgroundRefresh } from './externalSearchBackgroundRefreshRuntime.js';
import { startKeepImportMonitor } from './import/keepImportMonitor.js';
import { startManagedInboxMonitor } from './import/managedInboxMonitor.js';
import { startReadwiseApiScheduler } from './import/readwiseApiScheduler.js';
import { appendBootEvent } from './ipc/boot.js';
import { migrateLegacyWebviewStorage } from './ipc/legacyWebviewStorage.js';
import { resumePendingMirrorOutput } from './mirror/rebuildMirrorOutput.js';

let watchdogStarted = false;

function ensureDesktopTaskWatchdog() {
  if (watchdogStarted) {
    return;
  }
  watchdogStarted = true;
  startDesktopTaskWatchdog();
}

function startLightService(label: string, task: () => Promise<unknown> | unknown) {
  void Promise.resolve().then(task).catch((error) => console.error(label, error));
}

export function startFollowupTasks() {
  ensureDesktopTaskWatchdog();
  const backupHandle = submitDesktopOperation('automatic-backup', {
    failureLabel: '[backup] automatic backup reconcile failed',
    run: () => reconcileAutomaticDatabaseBackups()
  });
  void backupHandle.promise.catch(() => undefined);
  const mirrorHandle = submitDesktopOperation('mirror-backfill', {
    failureLabel: '[mirror] startup resume failed',
    run: resumePendingMirrorOutput
  });
  void mirrorHandle.promise.catch(() => undefined);
  const legacyStorageHandle = submitDesktopOperation('legacy-webview-migration', {
    failureLabel: '[storage] legacy webview migration failed',
    run: () => migrateLegacyWebviewStorage()
  });
  void legacyStorageHandle.promise.catch(() => undefined);
  startLightService('[pdf] pending indexing resume failed', resumePendingPdfAttachmentIndexing);
  startLightService('[search] invalidation scheduler failed', startSearchIndexInvalidationScheduler);
  void appendBootEvent('startup_followup_tasks_started');
  const inboxHandle = submitDesktopOperation('managed-inbox-import', {
    failureLabel: '[managed-inbox] startup monitor failed',
    run: startManagedInboxMonitor
  });
  void inboxHandle.promise.catch(() => undefined);
  startLightService('[keep-import] startup monitor failed', startKeepImportMonitor);
  startLightService('[readwise-api] startup scheduler failed', startReadwiseApiScheduler);
  startLightService('[external-search] background refresh scheduler failed', startExternalSearchBackgroundRefresh);
}
