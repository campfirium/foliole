import { getIosCompanionDatabaseOwner } from './companion/runtime/iosCompanionDatabaseBootstrap';
import { getCompanionFolderBackupPort } from './companionFolderBackupRuntimeRepository';

export async function backUpCompanionDatabase(chooseDirectory = false) {
  const owner = getIosCompanionDatabaseOwner();
  const port = getCompanionFolderBackupPort();
  const sourceEpoch = await owner.folderBackupSource(port);
  const requestId = crypto.randomUUID();
  const result = await port.backupDatabase({ sourceEpoch, requestId, chooseDirectory });
  if (result.requestId !== requestId) throw new Error('folder_backup_response_mismatch');
  return result;
}
