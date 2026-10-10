import Database from 'better-sqlite3';

import { mergeRestoredForegroundTime, type ForegroundTimePreservation } from '../../lib/core/database/foregroundTimeRestore.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

export async function prepareForegroundTimeBackupCandidate(databasePath: string,
  preserved: ForegroundTimePreservation, hostName: string) {
  const db = new Database(databasePath, { fileMustExist: true });
  try {
    initializeDatabaseSchema(db);
    await mergeRestoredForegroundTime(createBetterSqliteDbPort(db), preserved, hostName);
  } finally { db.close(); }
}
