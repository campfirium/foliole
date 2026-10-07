import type { FullTextSearchIndexStrategy } from '../../lib/core/database/fullTextSearchIndexStrategy.js';
import {
  claimSearchIndexInvalidations,
  completeInvalidations,
  failInvalidations
} from '../../lib/core/database/searchIndexInvalidations.js';
import { retireSearchPendingThrough } from '../../lib/core/database/searchPendingState.js';
import { prepareWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';
import { markWorkspaceSearchSourceRevisionQueued } from '../../lib/core/database/workspaceSearchSourceState.js';
import type { NodeVersionBodyStorage } from '../../lib/core/sync/syncNodeTombstoneVersion.js';
import { openDatabaseConnection } from '../database/connection.js';
import { runDesktopDatabaseWrite } from '../database/desktopDatabaseWriteQueue.js';

import { runSearchWorker } from './searchIndexWorkerTransport.js';

export async function runWorkspaceSearchRebuildInWorker(strategy: FullTextSearchIndexStrategy, signal?: AbortSignal,
  bodyStorage: NodeVersionBodyStorage = 'continuous') {
  const source = await runDesktopDatabaseWrite('background', () => (
    markWorkspaceSearchSourceRevisionQueued(openDatabaseConnection().driver)
  ));
  const result = await runSearchWorker({ strategy, source, bodyStorage }, signal);
  if (result.status.status === 'ready') {
    await runDesktopDatabaseWrite('background', () => {
      retireSearchPendingThrough(openDatabaseConnection().driver, result.coveredId ?? 0);
    });
  }
  return result.status;
}

export async function runWorkspaceSearchMaintenanceInWorker(limit: number, signal?: AbortSignal,
  bodyStorage: NodeVersionBodyStorage = 'continuous') {
  const strategy = await runDesktopDatabaseWrite('background', () => (
    prepareWorkspaceSearchSidecar(openDatabaseConnection())
  ));
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (strategy) {
    const status = await runWorkspaceSearchRebuildInWorker(strategy, signal, bodyStorage);
    if (status.status !== 'ready') throw new Error(status.error ?? 'Search index is not ready.');
  }
  const rows = await runDesktopDatabaseWrite('background', () => (
    claimSearchIndexInvalidations(openDatabaseConnection().driver, limit)
  ));
  if (rows.length === 0) return { failed: 0, processed: 0 };
  try {
    await runSearchWorker({ rows, bodyStorage }, signal);
    await runDesktopDatabaseWrite('background', () => {
      completeInvalidations(openDatabaseConnection().driver, rows.map((row) => row.id));
    });
    return { failed: 0, processed: rows.length };
  } catch (error) {
    await runDesktopDatabaseWrite('background', () => {
      failInvalidations(openDatabaseConnection().driver, rows.map((row) => row.id), error);
    });
    if (signal?.aborted) throw error;
    return { failed: rows.length, processed: 0 };
  }
}
