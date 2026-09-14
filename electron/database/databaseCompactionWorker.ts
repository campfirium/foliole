import { parentPort, workerData } from 'node:worker_threads';

import {
  compactAndVerifyDatabaseCandidate,
  type DatabaseCompactionWorkerInput
} from './databaseCompactionWorkerCore.js';

type WorkerOutput = { ok: true } | { message: string; ok: false; stack?: string };

function runWorker(input: DatabaseCompactionWorkerInput): WorkerOutput {
  try {
    compactAndVerifyDatabaseCandidate(input);
    return { ok: true };
  } catch (error) {
    if (error instanceof Error) {
      return { message: error.message, ok: false, ...(error.stack ? { stack: error.stack } : {}) };
    }
    return { message: 'Unknown database compaction worker failure.', ok: false };
  }
}

parentPort?.postMessage(runWorker(workerData as DatabaseCompactionWorkerInput));
