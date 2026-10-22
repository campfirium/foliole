import { Worker } from 'node:worker_threads';

import type {
  DatabaseUpgradeProgress, DatabaseUpgradeWorkerInput, DatabaseUpgradeWorkerMessage
} from './databaseUpgradeWorkerContract.js';

/** Settles only after the worker exits, so the main process never opens a library still being written. */
export function runDatabaseUpgradeWorker(input: DatabaseUpgradeWorkerInput,
  onProgress: (progress: DatabaseUpgradeProgress) => void): Promise<{ previousVersion: number }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./databaseUpgradeWorker.js', import.meta.url), { workerData: input });
    let result: Extract<DatabaseUpgradeWorkerMessage, { type: 'result' }> | null = null;
    let failure: Error | null = null;
    worker.on('message', (message: DatabaseUpgradeWorkerMessage) => {
      if (message.type === 'progress') onProgress({ from: message.from, to: message.to, version: message.version });
      else result = message;
    });
    worker.once('error', (error) => { failure = error instanceof Error ? error : new Error(String(error)); });
    worker.once('exit', (code) => {
      const settled = result as typeof result;
      if (failure) return reject(failure);
      if (code !== 0 || !settled) return reject(new Error(`database_upgrade_worker_exited:${code}`));
      if (!settled.ok) return reject(new Error(settled.message));
      resolve({ previousVersion: settled.previousVersion });
    });
  });
}
