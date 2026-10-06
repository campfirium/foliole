import { maintainAttachments } from '../../lib/core/attachments/attachmentMaintenance.js';
import { attachmentDatabaseRevision, readAttachmentReferenceSnapshot } from '../../lib/core/attachments/attachmentReferenceSnapshot.js';
import { recordFramedSyncResourceAvailability } from '../../lib/core/database/framedSyncResourceAvailability.js';
import type { AttachmentMaintenanceRequest } from '../../lib/platform/attachmentMaintenanceContract.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';

import { attachmentDatabaseGeneration, readAttachmentObservationState, writeAttachmentObservationState } from './attachmentMaintenanceState.js';
import { attachmentFileAvailable, attachmentTrashDirectory, inventoryAttachmentDirectory, moveAttachmentToTrash,
  removeTrashedAttachment, restoreAttachmentFromTrash } from './attachmentTrashFiles.js';

export function runDesktopAttachmentMaintenance(request: AttachmentMaintenanceRequest, signal?: AbortSignal) {
  const { assetsDir } = resolveRuntimeDataPaths();
  const now = new Date();
  const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  const currentDatabasePath = () => openDatabaseConnection().dbPath;
  return maintainAttachments({
    generation: () => runWithDatabaseConnectionOwner(() =>
      attachmentDatabaseGeneration(currentDatabasePath())),
    references: () => runWithDatabaseConnectionOwner(() => {
      const connection = openDatabaseConnection();
      return readAttachmentReferenceSnapshot(
        createBetterSqliteDbPort(connection.sqlite, { name: 'attachment-maintenance-snapshot' }), signal);
    }),
    inventory: async (trash) => inventoryAttachmentDirectory(trash ? attachmentTrashDirectory(assetsDir) : assetsDir),
    readState: () => runWithDatabaseConnectionOwner(() =>
      readAttachmentObservationState(currentDatabasePath())),
    writeState: (state) => runWithDatabaseConnectionOwner(() => {
      signal?.throwIfAborted();
      writeAttachmentObservationState(currentDatabasePath(), state);
    }),
    withStableRevision: (revision, action) => runWithDatabaseConnectionOwner(() => {
      const connection = openDatabaseConnection();
      const db = createBetterSqliteDbPort(connection.sqlite, { name: 'attachment-maintenance-commit' });
      return db.transaction(async (tx) => {
        if (revision !== await attachmentDatabaseRevision(tx)) throw new Error('attachment_scan_database_changed');
        signal?.throwIfAborted();
        return action();
      });
    }),
    move: async (key, trash) => {
      (trash ? moveAttachmentToTrash : restoreAttachmentFromTrash)(assetsDir, key);
      await updateAvailability(assetsDir, key);
    },
    removeTrash: async (key) => {
      removeTrashedAttachment(assetsDir, key);
      await updateAvailability(assetsDir, key);
    }
  }, request, day, signal);
}

function updateAvailability(assetsDir: string, key: string) {
  return runWithDatabaseConnectionOwner(() => recordFramedSyncResourceAvailability(
    createBetterSqliteDbPort(openDatabaseConnection().sqlite), [key.slice(0, 64)],
    attachmentFileAvailable(assetsDir, key)));
}
