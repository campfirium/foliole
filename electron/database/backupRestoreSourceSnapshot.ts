import { randomUUID } from 'node:crypto';
import path from 'node:path';

import Database from 'better-sqlite3';

import type { DatabaseRestoreArtifacts } from './databaseRestoreArtifacts.js';

export async function snapshotBackupRestoreSource(artifacts: DatabaseRestoreArtifacts,
  sourcePath: string, directory: string) {
  const materialized = await artifacts.materialize(sourcePath, directory);
  const destination = path.join(directory, `.foliole-restore-source-${randomUUID()}.db`);
  artifacts.trackCandidate(destination);
  const sqlite = new Database(materialized, { readonly: true, fileMustExist: true });
  try { await sqlite.backup(destination); }
  finally { sqlite.close(); }
  return destination;
}
