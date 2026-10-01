import { createRequire } from 'node:module';
import { parentPort, workerData } from 'node:worker_threads';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { runLegacyBodyCollectionBatch } from './legacyBodyCollectionBatch.js';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3') as typeof import('better-sqlite3');
const input = workerData as { dbPath: string; limit: number };
const sqlite = new Database(input.dbPath, { fileMustExist: true });
try {
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const result = runLegacyBodyCollectionBatch({ driver: createBetterSqlite3Driver(sqlite), sqlite }, input.limit);
  parentPort?.postMessage({ ok: true, result });
} catch (error) {
  parentPort?.postMessage({ ok: false, message: error instanceof Error ? error.message : String(error) });
} finally {
  sqlite.close();
}
