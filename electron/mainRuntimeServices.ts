import { markDatabaseReady, markDatabaseStartupFailed } from './database/databaseReadiness.js';
import { initializeDatabase } from './database/migrate.js';
import { startSearchAliasMirror } from './database/searchAliasMirror.js';
import { upgradeLibraryBeforeStartup } from './database/startupLibraryUpgrade.js';
import { appendMainProcessDiagnosticLog } from './diagnostics/mainProcessDiagnostics.js';
import { startDesktopForegroundTime } from './foregroundTimeRuntime.js';
import { refreshGlobalClipShortcutFromSettings } from './globalClipShortcut.js';
import { seedStartupGuidedSample } from './guidedSampleStartupSeed.js';
import { appendBootEvent } from './ipc/boot.js';
import { installAppMenu } from './ipc/menu.js';

export async function initializeRuntimeServices() {
  try {
    await appendBootEvent('database_init_start');
    await upgradeLibraryBeforeStartup((stage, payload = null) => { void appendBootEvent(stage, payload).catch(() => undefined); });
    await appendBootEvent('database_initialize_call_start');
    initializeDatabase((stage, payload = null) => {
      void appendBootEvent(stage, payload).catch((error) => appendMainProcessDiagnosticLog('boot_log_failed', {
        error,
        stage
      }));
    }, { deferSearchIndex: true, rebindMemberIdentity: true });
    await appendBootEvent('database_initialize_call_complete');
    // A new library gets its guided sample before any window can read or edit it.
    await seedStartupGuidedSample();
    await startSearchAliasMirror();
    refreshGlobalClipShortcutFromSettings();
    await appendBootEvent('database_init_complete');
    startDesktopForegroundTime();
    installAppMenu();
    markDatabaseReady();
  } catch (error) {
    markDatabaseStartupFailed(error);
    throw error;
  }
}
