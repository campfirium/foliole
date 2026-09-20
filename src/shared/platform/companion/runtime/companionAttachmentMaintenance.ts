import { maintainAttachments } from '../../../../../lib/core/attachments/attachmentMaintenance';
import { attachmentDatabaseRevision, readAttachmentReferenceSnapshot } from '../../../../../lib/core/attachments/attachmentReferenceSnapshot';
import type { AttachmentMaintenanceRequest, AttachmentObservationState } from '../../../../../lib/platform/attachmentMaintenanceContract';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository';

import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';

export function runCompanionAttachmentMaintenance(request: AttachmentMaintenanceRequest, signal?: AbortSignal) {
  const owner = getIosCompanionDatabaseOwner();
  return owner.runWriter(async (db) => {
    const files = FolioleCompanionSync.maintainAttachmentFiles.bind(FolioleCompanionSync);
    const now = new Date();
    const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    return maintainAttachments({
      generation: async () => {
        const result = await files({ operation: 'generation', databasePath: owner.databasePath });
        if (!result.generation) throw new Error('attachment_database_generation_missing');
        return result.generation;
      },
      references: () => readAttachmentReferenceSnapshot(db, signal),
      inventory: async (trash) => {
        const result = await files({ operation: 'inventory', trash });
        if (!result.files) throw new Error('attachment_inventory_missing');
        return result.files;
      },
      readState: async () => {
        const { state } = await files({ operation: 'read-state' });
        return state ? JSON.parse(state) as AttachmentObservationState : null;
      },
      writeState: async (state) => {
        signal?.throwIfAborted();
        await files({ operation: 'write-state', state: JSON.stringify(state) });
      },
      withStableRevision: (revision, action) => db.transaction(async (tx) => {
        if (revision !== await attachmentDatabaseRevision(tx)) throw new Error('attachment_scan_database_changed');
        signal?.throwIfAborted();
        return action();
      }),
      move: async (storageKey, trash) => { await files({ operation: 'move', storageKey, trash }); },
      removeTrash: async (storageKey) => { await files({ operation: 'remove-trash', storageKey }); }
    }, request, day, signal);
  });
}
