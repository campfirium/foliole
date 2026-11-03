import { COMPANION_DATABASE_NAME, COMPANION_DATABASE_VERSION } from '../../../../../lib/platform/nativeCompanionContract';
import { FolioleIosCompanionAppDataFiles } from '../../companionAppDataRuntimeRepository';
import { runCompanionSyncControlWriterTask } from '../../companionSyncWriterQueue';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository';

import { deleteCompanionDatabaseFiles } from './companionDatabaseManager';
import { closeIosCompanionDatabase, getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';

const resetKey = 'foliole-companion-ios-data-clear';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Persist intent before deleting anything; bootstrap finishes it before opening a library. */
export function clearIosCompanionAppData() {
  return runCompanionSyncControlWriterTask(async () => {
    if (window.localStorage.getItem(resetKey) === null) {
      const rows = await getIosCompanionDatabaseOwner().read(db => db.query<{ value: string }>(
        "SELECT value FROM companion_meta WHERE key = 'read_intent_library_id'"
      ));
      window.localStorage.setItem(resetKey, JSON.stringify({ journalId: rows[0]?.value ?? null }));
    }
    await resumeIosCompanionAppDataReset();
  });
}

export async function resumeIosCompanionAppDataReset() {
  const pending = window.localStorage.getItem(resetKey);
  if (pending === null) return;
  const { journalId } = JSON.parse(pending) as { journalId: unknown };
  if (journalId !== null && (typeof journalId !== 'string' || !uuid.test(journalId))) {
    throw new Error('Invalid pending app data clear.');
  }
  await FolioleCompanionSync.setSyncEnabled({ sync_enabled: false });
  await FolioleCompanionSync.stopSyncGroupProvider();
  await FolioleCompanionSync.stopDiscoverySession();
  await closeIosCompanionDatabase();
  const names = [COMPANION_DATABASE_NAME, 'foliole-foreground-time-owners'];
  if (journalId) names.push(`foliole-read-intents-${journalId}`);
  for (const database of names) {
    await deleteCompanionDatabaseFiles(database, database === COMPANION_DATABASE_NAME ? COMPANION_DATABASE_VERSION : 1);
  }
  await FolioleIosCompanionAppDataFiles.clearAppData();
  // Removing intent is the final step; a native failure remains resumable after restart.
  window.sessionStorage.clear();
  window.localStorage.clear();
}
