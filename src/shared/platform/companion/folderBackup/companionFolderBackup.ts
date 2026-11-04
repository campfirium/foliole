import { runCompanionSyncWriterTask } from '../../companionSyncWriterQueue';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

import { getCompanionFolderBackupPort } from './companionFolderBackupRuntimeRepository';
import { consumeCompanionFolderAttachmentWork } from './consumeCompanionFolderAttachmentWork';

export async function backUpCompanionDatabase(chooseDirectory = false) {
  const owner = getIosCompanionDatabaseOwner();
  const port = getCompanionFolderBackupPort();
  const sourceEpoch = await owner.folderBackupSource(port);
  const requestId = crypto.randomUUID();
  const result = await port.backupDatabase({ sourceEpoch, requestId, chooseDirectory });
  if (result.requestId !== requestId) throw new Error('folder_backup_response_mismatch');
  if (!result.cancelled && result.databaseCommitted) {
    result.state = await consumeCompanionFolderAttachmentWork(port, {
      write: execute => runCompanionSyncWriterTask(() => owner.runWriter(execute)),
      inventory: () => FolioleCompanionSync.maintainAttachmentFiles({ operation: 'inventory', trash: false })
    }, { requestId, sourceEpoch, profile: result.state.directoryId ?? '' });
  }
  return result;
}
