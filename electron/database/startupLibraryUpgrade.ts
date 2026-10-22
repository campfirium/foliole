import { clearDatabaseUpgradeProgress, reportDatabaseUpgradeProgress } from './databaseUpgradeStatus.js';
import { upgradeLibraryDatabaseOffMainThread } from './libraryUpgradeOffMainThread.js';

/** Upgrades an older library before startup opens it; the outcome is kept in the boot log. */
export async function upgradeLibraryBeforeStartup(reportStage: (stage: string, payload?: unknown) => void) {
  const startedAt = performance.now();
  try {
    const result = await upgradeLibraryDatabaseOffMainThread(reportDatabaseUpgradeProgress);
    reportStage('database_background_upgrade_complete', { durationMs: Math.round(performance.now() - startedAt), result });
  } finally {
    clearDatabaseUpgradeProgress();
  }
}
