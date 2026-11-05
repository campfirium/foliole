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

export function subscribeCompanionFolderBackupWork(listener: () => void) {
  return getIosCompanionDatabaseOwner().committedWrites.subscribe(listener);
}
