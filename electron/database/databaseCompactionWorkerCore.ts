import { createRequire } from 'node:module';

import { verifyDatabaseIntegrity } from './integrity.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

export interface DatabaseCompactionWorkerInput {
  candidatePath: string;
  sourcePath: string;
}

export function compactAndVerifyDatabaseCandidate(input: DatabaseCompactionWorkerInput) {
  const source = new BetterSqlite3(input.sourcePath, { fileMustExist: true, readonly: true });
  try {
    source.exec(`VACUUM main INTO ${toSqliteStringLiteral(input.candidatePath)}`);
  } finally {
    source.close();
  }

  const candidate = new BetterSqlite3(input.candidatePath, { fileMustExist: true, readonly: true });
  try {
    verifyDatabaseIntegrity(candidate);
  } finally {
    candidate.close();
  }
}

function toSqliteStringLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}
