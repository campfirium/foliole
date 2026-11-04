import { copyCompanionFolderAttachments } from './companion/folderBackup/copyCompanionFolderAttachments';
import { getIosCompanionDatabaseOwner } from './companion/runtime/iosCompanionDatabaseBootstrap';
import { getCompanionFolderBackupPort } from './companionFolderBackupRuntimeRepository';
import { FolioleCompanionSync } from './companionWorkspaceRuntimeRepository';

export async function backUpCompanionDatabase(chooseDirectory = false) {
  const owner = getIosCompanionDatabaseOwner();
  const port = getCompanionFolderBackupPort();
  const sourceEpoch = await owner.folderBackupSource(port);
  const requestId = crypto.randomUUID();
  const result = await port.backupDatabase({ sourceEpoch, requestId, chooseDirectory });
  if (result.requestId !== requestId) throw new Error('folder_backup_response_mismatch');
  if (!result.cancelled && result.databaseCommitted) {
    result.state = await copyCompanionFolderAttachments(port, { sourceEpoch, requestId },
      () => FolioleCompanionSync.maintainAttachmentFiles({ operation: 'inventory', trash: false }));
  }
  return result;
}
