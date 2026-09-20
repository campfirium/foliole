import { maintainAttachments } from '../../lib/core/attachments/attachmentMaintenance.js';
import { attachmentDatabaseRevision, readAttachmentReferenceSnapshot } from '../../lib/core/attachments/attachmentReferenceSnapshot.js';
import type { AttachmentMaintenanceRequest } from '../../lib/platform/attachmentMaintenanceContract.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';

import { attachmentDatabaseGeneration, readAttachmentObservationState, writeAttachmentObservationState } from './attachmentMaintenanceState.js';
import { attachmentTrashDirectory, inventoryAttachmentDirectory, moveAttachmentToTrash,
  removeTrashedAttachment, restoreAttachmentFromTrash } from './attachmentTrashFiles.js';

export function runDesktopAttachmentMaintenance(request: AttachmentMaintenanceRequest, signal?: AbortSignal) {
  return runWithDatabaseConnectionOwner(async () => {
    const connection = openDatabaseConnection();
    const { assetsDir } = resolveRuntimeDataPaths();
    const db = createBetterSqliteDbPort(connection.sqlite, { name: 'attachment-maintenance' });
    const now = new Date();
    const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    return maintainAttachments({
      generation: async () => attachmentDatabaseGeneration(connection.dbPath),
      references: () => readAttachmentReferenceSnapshot(db, signal),
      inventory: async (trash) => inventoryAttachmentDirectory(trash ? attachmentTrashDirectory(assetsDir) : assetsDir),
      readState: async () => readAttachmentObservationState(connection.dbPath),
      writeState: async (state) => { signal?.throwIfAborted(); writeAttachmentObservationState(connection.dbPath, state); },
      withStableRevision: (revision, action) => db.transaction(async (tx) => {
        if (revision !== await attachmentDatabaseRevision(tx)) throw new Error('attachment_scan_database_changed');
        signal?.throwIfAborted();
        return action();
      }),
      move: async (key, trash) => { (trash ? moveAttachmentToTrash : restoreAttachmentFromTrash)(assetsDir, key); },
      removeTrash: async (key) => removeTrashedAttachment(assetsDir, key)
    }, request, day, signal);
  });
}
