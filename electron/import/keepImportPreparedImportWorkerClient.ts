import { Worker } from 'node:worker_threads';

import type { PersistedImportRecord, PreparedImportRecord } from '../../lib/core/import/contract.js';
import { resolveDatabasePath } from '../database/connection.js';

interface WorkerResultSuccess {
  ok: true;
  record: PersistedImportRecord;
}

interface WorkerResultFailure {
  message: string;
  ok: false;
  stack?: string;
}

type WorkerResult = WorkerResultSuccess | WorkerResultFailure;

const WORKER_IMPORT_TIMEOUT_MS = 120_000;

interface WorkerImportRun {
  reject: (error: Error) => void;
  resolve: (record: PersistedImportRecord) => void;
  settled: boolean;
  signal?: AbortSignal;
  timeout?: NodeJS.Timeout;
  worker: Worker;
}

function toWorkerFailureError(result: WorkerResultFailure) {
  const error = new Error(result.message);
  if (result.stack) {
    error.stack = result.stack;
  }
  return error;
}

function createAbortError() {
  return new DOMException('AbortError', 'AbortError');
}

function normalizeWorkerError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

function cleanupWorkerImport(run: WorkerImportRun, abort: () => void) {
  if (run.timeout) {
    clearTimeout(run.timeout);
  }
  run.signal?.removeEventListener('abort', abort);
}

function rejectWorkerImport(run: WorkerImportRun, abort: () => void, error: Error) {
  if (run.settled) {
    return;
  }
  run.settled = true;
  cleanupWorkerImport(run, abort);
  run.reject(error);
}

function terminateWorkerImport(run: WorkerImportRun, abort: () => void, error: Error) {
  if (run.settled) {
    return;
  }
  run.settled = true;
  cleanupWorkerImport(run, abort);
  void run.worker.terminate();
  run.reject(error);
}

function resolveWorkerImport(run: WorkerImportRun, abort: () => void, record: PersistedImportRecord) {
  if (run.settled) {
    return;
  }
  run.settled = true;
  cleanupWorkerImport(run, abort);
  run.resolve(record);
}

function bindWorkerImportHandlers(run: WorkerImportRun, abort: () => void) {
  run.worker.once('message', (result: WorkerResult) => {
    if (result.ok) {
      resolveWorkerImport(run, abort, result.record);
      return;
    }
    rejectWorkerImport(run, abort, toWorkerFailureError(result));
  });
  run.worker.once('error', (error) => {
    rejectWorkerImport(run, abort, normalizeWorkerError(error));
  });
  run.worker.once('exit', (code) => {
    if (code !== 0) {
      rejectWorkerImport(run, abort, new Error(`Readwise import worker exited with code ${code}.`));
    }
  });
}

export function runPreparedImportInWorker(prepared: PreparedImportRecord): Promise<PersistedImportRecord> {
  return runPreparedImportInWorkerWithSignal({ prepared });
}

export function runPreparedImportInWorkerWithSignal(input: {
  prepared: PreparedImportRecord;
  signal?: AbortSignal;
}): Promise<PersistedImportRecord> {
  return new Promise((resolve, reject) => {
    if (input.signal?.aborted) {
      reject(createAbortError());
      return;
    }
    const worker = new Worker(new URL('./keepImportPreparedImportWorker.js', import.meta.url), {
      workerData: {
        dbPath: resolveDatabasePath(),
        prepared: input.prepared
      }
    });
    const run: WorkerImportRun = {
      reject,
      resolve,
      settled: false,
      ...(input.signal ? { signal: input.signal } : {}),
      worker
    };
    const abort = () => {
      terminateWorkerImport(run, abort, createAbortError());
    };
    run.timeout = setTimeout(() => {
      terminateWorkerImport(run, abort, new Error('Readwise import worker timed out.'));
    }, WORKER_IMPORT_TIMEOUT_MS);
    input.signal?.addEventListener('abort', abort, { once: true });
    bindWorkerImportHandlers(run, abort);
  });
}
