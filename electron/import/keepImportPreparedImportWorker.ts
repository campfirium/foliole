import { createRequire } from 'node:module';
import { parentPort, workerData } from 'node:worker_threads';

import { runPreparedImport } from '../../lib/core/database/index.js';
import type { PersistedImportRecord, PreparedImportRecord } from '../../lib/core/import/contract.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

interface WorkerInput {
  dbPath: string;
  prepared: PreparedImportRecord;
}

type WorkerOutput =
  | { ok: true; record: PersistedImportRecord }
  | { message: string; ok: false; stack?: string };

function toWorkerError(error: unknown): WorkerOutput {
  if (error instanceof Error) {
    return {
      message: error.message,
      ok: false,
      ...(error.stack ? { stack: error.stack } : {})
    };
  }
  return { message: 'Unknown worker import failure', ok: false };
}

function runWorkerImport(input: WorkerInput): WorkerOutput {
  const sqlite = new BetterSqlite3(input.dbPath);
  try {
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    return {
      ok: true,
      record: runPreparedImport(createBetterSqlite3Driver(sqlite), input.prepared)
    };
  } catch (error) {
    return toWorkerError(error);
  } finally {
    sqlite.close();
  }
}

parentPort?.postMessage(runWorkerImport(workerData as WorkerInput));
