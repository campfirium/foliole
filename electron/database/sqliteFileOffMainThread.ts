import { createRequire } from 'node:module';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

import { DatabaseIntegrityError, verifyDatabaseIntegrity } from './integrity.js';
import type { SqliteFileWork, SqliteFileWorkerMessage } from './sqliteFileWorkerContract.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

class WorkerUnavailableError extends Error {}

function runSqliteFileWorker(work: SqliteFileWork) {
  return new Promise<SqliteFileWorkerMessage>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./sqliteFileWorker.js', import.meta.url), { workerData: work });
    } catch (error) {
      reject(new WorkerUnavailableError(error instanceof Error ? error.message : String(error)));
      return;
    }
    let message: SqliteFileWorkerMessage | null = null;
    worker.once('message', (value: SqliteFileWorkerMessage) => { message = value; });
    worker.once('error', (error: Error) => reject(new WorkerUnavailableError(error.message)));
    worker.once('exit', (code) => message ? resolve(message)
      : reject(new WorkerUnavailableError(`sqlite_file_worker_exited:${code}`)));
  });
}

/** Runs the work in the SQLite file worker; a worker that cannot run leaves it to the main-thread fallback. */
async function runOffMainThread<T>(work: SqliteFileWork, fallback: () => T | Promise<T>,
  accept: (message: Extract<SqliteFileWorkerMessage, { ok: true }>) => T) {
  let message: SqliteFileWorkerMessage;
  try {
    message = await runSqliteFileWorker(work);
  } catch (error) {
    if (!(error instanceof WorkerUnavailableError)) throw error;
    console.error(`[backup] background ${work.operation} unavailable; running on the main thread`, error);
    return fallback();
  }
  if (!message.ok) throw new Error(message.message);
  return accept(message);
}

/** The same quick check as `verifyDatabaseIntegrity`, without holding the window while a large file is read. */
export function verifySqliteDatabaseFileOffMainThread(filePath: string) {
  const sourcePath = path.resolve(filePath);
  return runOffMainThread({ operation: 'quick_check', sourcePath }, () => {
    const sqlite = new BetterSqlite3(sourcePath, { fileMustExist: true, readonly: true });
    try { verifyDatabaseIntegrity(sqlite); } finally { sqlite.close(); }
  }, (message) => {
    const result = 'result' in message ? message.result : 'unknown';
    if (result !== 'ok') throw new DatabaseIntegrityError(`sqlite quick_check failed: ${result}`);
  });
}

/** Copies a database file with SQLite's online backup, without holding the window for the whole copy. */
export function backupSqliteFileOffMainThread(sourcePath: string, destinationPath: string,
  fallback: () => Promise<{ remainingPages: number; totalPages: number }>, live = false) {
  return runOffMainThread({ destinationPath, live, operation: 'backup', sourcePath }, fallback, (message) => ({
    remainingPages: 'remainingPages' in message ? message.remainingPages : 0,
    totalPages: 'totalPages' in message ? message.totalPages : 0
  }));
}
