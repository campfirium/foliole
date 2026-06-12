import { createRequire } from 'node:module';
import { parentPort, workerData } from 'node:worker_threads';

import type { FullTextSearchIndexStrategy } from '../../lib/core/database/fullTextSearchIndexStrategy.js';
import {
  rebuildWorkspaceSearchSidecar,
  type WorkspaceSearchSidecarRebuildStatus
} from '../../lib/core/database/workspaceSearchSidecar.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

interface WorkerInput {
  dbPath: string;
  searchDbPath: string;
  strategy: FullTextSearchIndexStrategy;
}

type WorkerOutput =
  | { ok: true; status: WorkspaceSearchSidecarRebuildStatus }
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

function runWorker(input: WorkerInput): WorkerOutput {
  const sqlite = new BetterSqlite3(input.dbPath);
  try {
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    sqlite.prepare('ATTACH DATABASE ? AS search').run(input.searchDbPath);
    return {
      ok: true,
      status: rebuildWorkspaceSearchSidecar({
        driver: createBetterSqlite3Driver(sqlite),
        sqlite
      }, { strategy: input.strategy })
    };
  } catch (error) {
    return toWorkerError(error);
  } finally {
    sqlite.close();
  }
}

parentPort?.postMessage(runWorker(workerData as WorkerInput));
