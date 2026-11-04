import { completeFolderAttachmentCopy, prepareFolderAttachmentCopy } from '../../../../../lib/core/database/companionFolderAttachmentWork';
import { recordFramedSyncResourceAvailability } from '../../../../../lib/core/database/framedSyncResourceAvailability';
import { attachmentSourceVerification } from '../../../../../lib/core/sync/attachmentSourceVerification';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import type { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository';
import { currentCompanionFramedSyncFiles } from '../sync/framed/companionFramedSyncFiles';

import type { CapacitorCompanionDatabaseOwner } from './capacitorCompanionDatabaseOwner';
import { readCompanionAttachmentReferences } from './companionAttachmentReferenceSnapshot';

export function companionAttachmentFileOperation(owner: CapacitorCompanionDatabaseOwner,
  files: typeof FolioleCompanionSync.maintainAttachmentFiles,
  write: <T>(task: (db: DbPort) => Promise<T>) => Promise<T>, signal?: AbortSignal) {
  return async (operation: 'move' | 'remove-trash', storageKey: string, trash?: boolean) => {
    signal?.throwIfAborted();
    attachmentSourceVerification.invalidate(storageKey);
    const execute = async (tracked: boolean) => {
      if (tracked) await write(db => prepareFolderAttachmentCopy(db, storageKey, operation === 'remove-trash' ? 'delete' : 'copy'));
      const result = await files({ operation, storageKey, ...(trash === undefined ? {} : { trash }) });
      if (typeof result.available !== 'boolean') throw new Error('attachment_availability_missing');
      const available = result.available;
      await write(db => db.transaction(async tx => {
        await recordFramedSyncResourceAvailability(tx, [storageKey.slice(0, 64)], available);
        if (tracked) await completeFolderAttachmentCopy(tx, storageKey);
      }));
    };
    if (operation === 'move' && trash) return execute(false);
    return currentCompanionFramedSyncFiles().exclusive(`attachment-${storageKey.slice(0, 64)}`, async () => {
      // Freeing a local copy of a still-mounted resource never authorizes deleting its backup.
      const references = operation === 'remove-trash' ? await readCompanionAttachmentReferences(owner, signal) : null;
      return execute(!references?.storageKeys.includes(storageKey));
    });
  };
}
