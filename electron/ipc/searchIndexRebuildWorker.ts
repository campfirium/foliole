import { createRequire } from 'node:module';
import { parentPort, workerData } from 'node:worker_threads';

import { processClaimedInvalidationRows } from '../../lib/core/database/searchIndexInvalidations.js';
import { rebuildWorkspaceSearchIndexes } from '../../lib/core/database/workspaceSearchIndex.js';
import {
  readWorkspaceSearchSidecarRebuildStatus,
  rebuildWorkspaceSearchSidecar,
  type WorkspaceSearchSidecarRebuildStatus
} from '../../lib/core/database/workspaceSearchSidecar.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';

import type { SearchIndexWorkerInput } from './searchIndexWorkerContract.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

type WorkerOutput =
  | { ok: true; status: WorkspaceSearchSidecarRebuildStatus; coveredId?: number }
  | { message: string; ok: false; stack?: string };

function toWorkerError(error: unknown): WorkerOutput {
  if (error instanceof Error) {
    return {
      message: error.message,
      ok: false,
      ...(error.stack ? { stack: error.stack } : {})
    };
  }
  return { message: 'Unknown search index rebuild worker failure', ok: false };
}

function runWorker(input: SearchIndexWorkerInput): WorkerOutput {
  // Main bookkeeping runs in the shared write queue; this stage writes only search and temp tables.
  const sqlite = new BetterSqlite3(input.dbPath);
  try {
    sqlite.pragma('foreign_keys = ON');
    sqlite.prepare('ATTACH DATABASE ? AS search').run(input.searchDbPath);
    const connection = { driver: createBetterSqlite3Driver(sqlite), sqlite };
    if ('strategy' in input) {
      let coveredId = 0;
      const status = rebuildWorkspaceSearchSidecar(connection, {
        strategy: input.strategy, source: input.source, retirePending: false,
        onCoveredId: (id) => { coveredId = id; },
        rebuildWorkspaceSearchIndexes: (driver) => rebuildWorkspaceSearchIndexes(driver)
      });
      return { ok: true, status, coveredId };
    }
    const status = readWorkspaceSearchSidecarRebuildStatus(sqlite);
    if (!status || status.status !== 'ready') throw new Error(status?.error ?? 'Search index is not ready.');
    processClaimedInvalidationRows(connection.driver, input.rows);
    return { ok: true, status };
  } catch (error) {
    return toWorkerError(error);
  } finally {
    sqlite.close();
  }
}

parentPort?.postMessage(runWorker(workerData as SearchIndexWorkerInput));
