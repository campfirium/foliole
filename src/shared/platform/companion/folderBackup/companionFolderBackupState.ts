import { countFolderAttachmentWork, readFolderAttachmentProfile } from '../../../../../lib/core/database/companionFolderAttachmentWork';
import type { CompanionFolderBackupState } from '../../../../../lib/platform/companionFolderBackupContract';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

import { isFolderDatabaseBackupCurrent } from './companionFolderBackupProgress';
import { getCompanionFolderBackupPort } from './companionFolderBackupRuntimeRepository';

/** Combine durable native database results with the current library's live unfinished work. */
export async function getCompanionFolderBackupState(nativeState?: CompanionFolderBackupState): Promise<CompanionFolderBackupState> {
  const owner = getIosCompanionDatabaseOwner();
  const state = nativeState ?? await getCompanionFolderBackupPort().getState();
  return owner.read(async db => {
    const profile = await readFolderAttachmentProfile(db);
    if (!state.directoryId || profile !== state.directoryId) return { ...state, attachmentFilesPending: null, pendingItems: null };
    const pending = await countFolderAttachmentWork(db, profile);
    const databasePending = await isFolderDatabaseBackupCurrent(db, profile) ? 0 : 1;
    const [error] = await db.query<{ last_error: string }>(`SELECT last_error FROM folder_attachment_work
      WHERE last_error IS NOT NULL ORDER BY storage_key,stage LIMIT 1`);
    return { ...state, attachmentFilesPending: pending, pendingItems: pending + databasePending, errorMessage: state.errorMessage || error?.last_error || null };
  });
}

const progressListeners = new Set<() => void>();

/** Backup bookkeeping opts out of committed-write notices (they would wake automatic backup and mark the
 * library changed), so a running backup announces its own recorded progress for the pending count. */
export function notifyCompanionFolderBackupProgress() {
  for (const listener of progressListeners) {
    try { listener(); } catch { /* Progress observers never change the backup result. */ }
  }
}

export function subscribeCompanionFolderBackupWork(listener: () => void) {
  progressListeners.add(listener);
  const committed = getIosCompanionDatabaseOwner().committedWrites.subscribe(listener);
  return () => { progressListeners.delete(listener); committed(); };
}
