import { createRequire } from 'node:module';
import { parentPort, workerData } from 'node:worker_threads';

import type { SqliteFileWork } from './sqliteFileWorkerContract.js';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3') as typeof import('better-sqlite3');

/**
 * SQLite copies its first backup step in one pass, so whole-file copies and checks of a large library
 * run here instead of on the main thread.
 */
async function run(work: SqliteFileWork) {
  const readonly = work.operation === 'quick_check' || !work.live;
  const sqlite = new Database(work.sourcePath, { fileMustExist: true, readonly });
  try {
    if (work.operation === 'quick_check') {
      return { result: String(sqlite.prepare('PRAGMA quick_check(1)').pluck().get() ?? 'unknown') };
    }
    const metadata = await sqlite.backup(work.destinationPath);
    return { remainingPages: metadata.remainingPages, totalPages: metadata.totalPages };
  } finally {
    sqlite.close();
  }
}

run(workerData as SqliteFileWork).then(
  (message) => parentPort?.postMessage({ ok: true, ...message }),
  (error: unknown) => parentPort?.postMessage({ message: error instanceof Error ? error.message : String(error), ok: false })
);
