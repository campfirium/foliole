import { Worker } from 'node:worker_threads';

import type { DatabaseCompactionWorkerInput } from './databaseCompactionWorkerCore.js';

type WorkerOutput = { ok: true } | { message: string; ok: false; stack?: string };

export function runDatabaseCompactionInWorker(input: DatabaseCompactionWorkerInput): Promise<void> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./databaseCompactionWorker.js', import.meta.url), { workerData: input });
    let result: WorkerOutput | null = null;
    worker.once('message', (message: WorkerOutput) => { result = message; });
    worker.once('error', (error) => reject(error));
    worker.once('exit', (code) => {
      if (code !== 0 || !result) {
        reject(new Error(`Database compaction worker exited with code ${code} without a result.`));
        return;
      }
      if (result.ok) return resolve();
      const error = new Error(result.message);
      if (result.stack) error.stack = result.stack;
      reject(error);
    });
  });
}
