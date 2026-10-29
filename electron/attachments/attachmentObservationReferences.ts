import { readCompleteAttachmentReferenceKeys, saveAttachmentReferenceResults } from '../../lib/core/attachments/attachmentReferenceCache.js';
import { attachmentDatabaseRevision } from '../../lib/core/attachments/attachmentReferenceSnapshot.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';

import { attachmentDatabaseGeneration } from './attachmentMaintenanceState.js';
import { runAttachmentReferenceWorker } from './attachmentReferenceWorkerClient.js';

export async function readDesktopObservationReferences(signal?: AbortSignal) {
  const source = await runWithDatabaseConnectionOwner(() => {
    const { dbPath } = openDatabaseConnection();
    return { path: dbPath, generation: attachmentDatabaseGeneration(dbPath) };
  });
  const assertSource = () => {
    const current = openDatabaseConnection();
    if (current.dbPath !== source.path || attachmentDatabaseGeneration(current.dbPath) !== source.generation) {
      throw new Error('attachment_scan_database_replaced');
    }
    return createBetterSqliteDbPort(current.sqlite);
  };
  await runAttachmentReferenceWorker(source.path, rows => runWithDatabaseConnectionOwner(async () => {
    signal?.throwIfAborted();
    await saveAttachmentReferenceResults(assertSource(), rows);
  }), signal);
  return runWithDatabaseConnectionOwner(() => {
    signal?.throwIfAborted();
    const db = assertSource();
    return db.transaction(async tx => {
      const storageKeys = await readCompleteAttachmentReferenceKeys(tx);
      if (storageKeys === null) return null;
      return { storageKeys, revision: await attachmentDatabaseRevision(tx) };
    });
  });
}
