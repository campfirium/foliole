import { runCompanionSyncWriterTask } from '../../companionSyncWriterQueue';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

import { captureFolderAttachmentDeletions, validateFolderAttachmentDeletions } from './companionFolderAttachmentDeletion';
import { confirmFolderDatabaseBackup, readFolderBackupRevision } from './companionFolderBackupProgress';
import { getCompanionFolderBackupPort } from './companionFolderBackupRuntimeRepository';
import { getCompanionFolderBackupState } from './companionFolderBackupState';
import { consumeCompanionFolderAttachmentWork } from './consumeCompanionFolderAttachmentWork';

interface BackupOptions { automatic?: boolean; continueWork?: () => boolean }
const manualListeners = new Set<() => void>();
export function subscribeManualCompanionFolderBackup(listener: () => void) {
  manualListeners.add(listener);
  return () => { manualListeners.delete(listener); };
}

let backupTail: Promise<unknown> = Promise.resolve();

function enqueueBackup<T>(run: () => Promise<T>) {
  const owner = getIosCompanionDatabaseOwner();
  const result = backupTail.catch(() => undefined).then(() => {
    if (getIosCompanionDatabaseOwner() !== owner) throw new Error('Backup database owner changed.');
    return run();
  });
  backupTail = result;
  return result;
}

export function forgetCompanionFolderBackupDirectory() {
  return enqueueBackup(() => getCompanionFolderBackupPort().clearDirectory());
}

export function backUpCompanionDatabase(chooseDirectory = false, options: BackupOptions = {}) {
  return enqueueBackup(() => runBackup(chooseDirectory, options)).then(value => {
    if (!options.automatic && !value.cancelled && value.databaseCommitted) {
      for (const listener of manualListeners) { try { listener(); } catch { /* Backup observers do not own the result. */ } }
    }
    return value;
  });
}

async function runBackup(chooseDirectory: boolean, options: BackupOptions) {
  const owner = getIosCompanionDatabaseOwner();
  const port = getCompanionFolderBackupPort();
  if (options.automatic && (!options.continueWork?.() || !(await port.getState()).configured)) {
    throw new Error('Automatic backup is stopped or has no folder.');
  }
  const sourceEpoch = await owner.folderBackupSource(port);
  const requestId = crypto.randomUUID();
  // An unreadable attachment reference blocks deletion, not saving the database itself.
  const deletionSnapshot = await captureFolderAttachmentDeletions(owner).catch(() => null);
  try {
  const revision = await owner.read(readFolderBackupRevision);
  const result = await port.backupDatabase({ sourceEpoch, requestId, chooseDirectory });
  if (result.requestId !== requestId) throw new Error('folder_backup_response_mismatch');
  if (!result.cancelled && result.databaseCommitted) {
    const deletions = await validateFolderAttachmentDeletions(owner, deletionSnapshot, result.state.directoryId ?? '');
    await owner.runWriter(db => confirmFolderDatabaseBackup(db, result.state.directoryId ?? '', revision), false);
    result.state = await consumeCompanionFolderAttachmentWork(port, {
      write: execute => runCompanionSyncWriterTask(() => owner.runWriter(execute, false)),
      inventory: async () => {
        const inventories = await Promise.all([false, true].map(trash =>
          FolioleCompanionSync.maintainAttachmentFiles({ operation: 'inventory', trash })));
        if (inventories.some(value => !value.files)) throw new Error('Cannot read the attachment directory.');
        return { files: inventories.flatMap(value => value.files!) };
      }
    }, { requestId, sourceEpoch, profile: result.state.directoryId ?? '', deletions, ...options });
  }
  result.state = await getCompanionFolderBackupState(result.state);
  return result;
  } catch (error) {
    await port.cancelDatabase({ requestId }).catch(() => undefined);
    throw error;
  }
}
