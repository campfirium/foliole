import { Worker } from 'node:worker_threads';

import type { WorkspaceSearchSidecarRebuildStatus } from '../../lib/core/database/workspaceSearchSidecar.js';
import { resolveDatabasePath, resolveSearchDatabasePath } from '../database/connection.js';

import type { SearchIndexWork } from './searchIndexWorkerContract.js';

export interface WorkerResultSuccess {
  ok: true;
  status: WorkspaceSearchSidecarRebuildStatus;
  processed?: number;
  failed?: number;
  coveredId?: number;
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

export function runSearchWorker(input: SearchIndexWork, signal?: AbortSignal): Promise<WorkerResultSuccess> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const dbPath = resolveDatabasePath();
    const worker = new Worker(new URL('./searchIndexRebuildWorker.js', import.meta.url), {
      workerData: {
        dbPath,
        searchDbPath: resolveSearchDatabasePath(dbPath),
        ...input
      }
    });
    const timeout = setTimeout(() => {
      void worker.terminate();
      reject(new Error('Search index rebuild worker timed out.'));
    }, SEARCH_INDEX_REBUILD_TIMEOUT_MS);
    const abort = () => {
      void worker.terminate();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    };
    let result: WorkerResult | null = null;
    worker.once('message', (message: WorkerResult) => { result = message; });
    worker.once('error', (error) => {
      cleanup();
      reject(normalizeWorkerError(error));
    });
    worker.once('exit', (code) => {
      cleanup();
      if (code !== 0 || !result) return reject(new Error(`Search index worker exited with code ${code} without a successful result.`));
      if (result.ok) resolve(result);
      else reject(toWorkerFailureError(result));
    });
  });
}
