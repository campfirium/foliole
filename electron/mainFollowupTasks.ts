import { reconcileAutomaticDatabaseBackups } from './database/backupRestore.js';
import { resumePendingPdfAttachmentIndexing } from './database/pdfIndexing.js';
import { startExternalSearchBackgroundRefresh } from './externalSearchBackgroundRefreshRuntime.js';
import { startKeepImportMonitor } from './import/keepImportMonitor.js';
import { startManagedInboxMonitor } from './import/managedInboxMonitor.js';
import { appendBootEvent } from './ipc/boot.js';
import { migrateLegacyWebviewStorage } from './ipc/legacyWebviewStorage.js';
import { backfillMissingMirrorOutput } from './mirror/rebuildMirrorOutput.js';
import { runStartupTask } from './startupTasks.js';

export function startFollowupTasks() {
  void runStartupTask('[backup] automatic backup reconcile failed', reconcileAutomaticDatabaseBackups);
  void runStartupTask('[mirror] startup backfill failed', backfillMissingMirrorOutput);
  void runStartupTask('[storage] legacy webview migration failed', migrateLegacyWebviewStorage);
  resumePendingPdfAttachmentIndexing();
  void appendBootEvent('startup_followup_tasks_started');
  void runStartupTask('[managed-inbox] startup monitor failed', startManagedInboxMonitor);
  void runStartupTask('[keep-import] startup monitor failed', startKeepImportMonitor);
  startExternalSearchBackgroundRefresh();
}
