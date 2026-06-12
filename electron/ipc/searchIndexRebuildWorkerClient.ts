import { Worker } from 'node:worker_threads';

import type { FullTextSearchIndexStrategy } from '../../lib/core/database/fullTextSearchIndexStrategy.js';
import type { WorkspaceSearchSidecarRebuildStatus } from '../../lib/core/database/workspaceSearchSidecar.js';
import { resolveDatabasePath, resolveSearchDatabasePath } from '../database/connection.js';

interface WorkerResultSuccess {
  ok: true;
  status: WorkspaceSearchSidecarRebuildStatus;
}

interface WorkerResultFailure {
  message: string;
  ok: false;
  stack?: string;
}

type WorkerResult = WorkerResultSuccess | WorkerResultFailure;

const SEARCH_INDEX_REBUILD_TIMEOUT_MS = 120_000;

function toWorkerFailureError(result: WorkerResultFailure) {
  const error = new Error(result.message);
  if (result.stack) {
    error.stack = result.stack;
  }
  return error;
}

function normalizeWorkerError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

export function runWorkspaceSearchRebuildInWorker(
  strategy: FullTextSearchIndexStrategy
): Promise<WorkspaceSearchSidecarRebuildStatus> {
  return new Promise((resolve, reject) => {
    const dbPath = resolveDatabasePath();
    const worker = new Worker(new URL('./searchIndexRebuildWorker.js', import.meta.url), {
      workerData: {
        dbPath,
        searchDbPath: resolveSearchDatabasePath(dbPath),
        strategy
      }
    });
    const timeout = setTimeout(() => {
      void worker.terminate();
      reject(new Error('Search index rebuild worker timed out.'));
    }, SEARCH_INDEX_REBUILD_TIMEOUT_MS);
    const cleanup = () => clearTimeout(timeout);
    worker.once('message', (result: WorkerResult) => {
      cleanup();
      if (result.ok) {
        resolve(result.status);
        return;
      }
      reject(toWorkerFailureError(result));
    });
    worker.once('error', (error) => {
      cleanup();
      reject(normalizeWorkerError(error));
    });
    worker.once('exit', (code) => {
      if (code !== 0) {
        cleanup();
        reject(new Error(`Search index rebuild worker exited with code ${code}.`));
      }
    });
  });
}
