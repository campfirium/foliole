import { createRequire } from 'node:module';
import { parentPort, workerData } from 'node:worker_threads';

import { collectTextBodyBlobCandidates } from '../../lib/core/database/textBodyBlobCollection.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3') as typeof import('better-sqlite3');
const input = workerData as { dbPath: string; hashes: string[] };
const sqlite = new Database(input.dbPath, { fileMustExist: true });
try {
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const driver = createBetterSqlite3Driver(sqlite);
  // Holder checks and deletion share one write transaction, so no new holder can appear in between.
  const result = sqlite.transaction(() => collectTextBodyBlobCandidates(driver, input.hashes)).immediate();
  parentPort?.postMessage({ ok: true, result });
} catch (error) {
  parentPort?.postMessage({ ok: false, message: error instanceof Error ? error.message : String(error) });
} finally {
  sqlite.close();
}
