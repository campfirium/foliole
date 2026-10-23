import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import type { DatabaseMigrationTarget } from '../../lib/core/database/migrationTypes.js';
import { retireSearchPendingThrough } from '../../lib/core/database/searchPendingState.js';
import { prepareWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';
import { markWorkspaceSearchSourceRevisionQueued } from '../../lib/core/database/workspaceSearchSourceState.js';
import { runSearchWorker } from '../ipc/searchIndexWorkerTransport.js';

interface RestoredLibraryConnection {
  driver: DatabaseDriver;
  sqlite: DatabaseMigrationTarget;
}

/**
 * The search index still describes the library that was replaced. Rebuild it in the search worker
 * before the restore reports completion, so the main thread stays responsive for large libraries.
 */
export async function rebuildRestoredLibrarySearchIndex(connection: RestoredLibraryConnection) {
  const strategy = prepareWorkspaceSearchSidecar(connection, { requireCurrentSource: true });
  if (!strategy) return;
  const source = markWorkspaceSearchSourceRevisionQueued(connection.driver);
  try {
    const result = await runSearchWorker({ source, strategy });
    if (result.status.status === 'ready') retireSearchPendingThrough(connection.driver, result.coveredId ?? 0);
  } catch (error) {
    // The restored library is complete; search maintenance retries a rebuild left unfinished.
    console.error('[backup] restored library search index rebuild failed', error);
  }
}
