import { runCompanionSyncWriterTask } from '../../companionSyncWriterQueue';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

import { captureFolderAttachmentDeletions, validateFolderAttachmentDeletions } from './companionFolderAttachmentDeletion';
import { getCompanionFolderBackupPort } from './companionFolderBackupRuntimeRepository';
import { consumeCompanionFolderAttachmentWork } from './consumeCompanionFolderAttachmentWork';

export async function backUpCompanionDatabase(chooseDirectory = false) {
  const owner = getIosCompanionDatabaseOwner();
  const port = getCompanionFolderBackupPort();
  const sourceEpoch = await owner.folderBackupSource(port);
  const requestId = crypto.randomUUID();
  // An unreadable attachment reference blocks deletion, not saving the database itself.
  const deletionSnapshot = await captureFolderAttachmentDeletions(owner).catch(() => null);
  const result = await port.backupDatabase({ sourceEpoch, requestId, chooseDirectory });
  if (result.requestId !== requestId) throw new Error('folder_backup_response_mismatch');
  if (!result.cancelled && result.databaseCommitted) {
    const deletions = await validateFolderAttachmentDeletions(owner, deletionSnapshot, result.state.directoryId ?? '');
    result.state = await consumeCompanionFolderAttachmentWork(port, {
      write: execute => runCompanionSyncWriterTask(() => owner.runWriter(execute)),
      inventory: async () => {
        const inventories = await Promise.all([false, true].map(trash =>
          FolioleCompanionSync.maintainAttachmentFiles({ operation: 'inventory', trash })));
        if (inventories.some(value => !value.files)) throw new Error('Cannot read the attachment directory.');
        return { files: inventories.flatMap(value => value.files!) };
      }
    }, { requestId, sourceEpoch, profile: result.state.directoryId ?? '', deletions });
  }
  return result;
}
