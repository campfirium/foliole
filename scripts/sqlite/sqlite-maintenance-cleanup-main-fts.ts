import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import {
  cleanupLegacyMainFtsTables,
  listLegacyMainFtsObjectNames
} from '../../electron/database/mainFtsCleanupCore.ts';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

const DEFAULT_LIVE_DATABASE_PATHS = [
  '/mnt/d/X/U/Foliole/Data/foliole.db',
  'D:\\X\\U\\Foliole\\Data\\foliole.db'
];
const LIVE_DATABASE_CONFIRMATION_FLAGS = [
  'i-understand-live-database',
  'i-have-current-backup'
];

interface OperatorSnapshotResult {
  destinationPath: string;
  reason: 'pre-cleanup';
  sourcePath: string;
}

export function runCleanupMainFts(dbPath: string, flags: Map<string, string | true>) {
  const resolvedDbPath = path.resolve(dbPath);
  const apply = flags.get('apply') === true;

  if (apply && isDefaultLiveDatabasePath(dbPath, resolvedDbPath) && hasMissingLiveDatabaseConfirmation(flags)) {
    writeCleanupMainFtsError({
      dbPath: resolvedDbPath,
      message: 'refusing to clean the default live Foliole database without --i-understand-live-database and --i-have-current-backup',
      mode: 'apply',
      status: 'refused-live-database'
    });
    process.exitCode = 1;
    return;
  }

  try {
    if (!apply) {
      runCleanupMainFtsDryRun(resolvedDbPath);
      return;
    }

    runCleanupMainFtsApply(resolvedDbPath, flags);
  } catch (error) {
    const status = isSqliteLockError(error) ? 'locked' : 'failed';
    writeCleanupMainFtsError({
      dbPath: resolvedDbPath,
      message: formatErrorMessage(error),
      mode: apply ? 'apply' : 'dry-run',
      status
    });
    process.exitCode = 1;
  }
}

function hasMissingLiveDatabaseConfirmation(flags: Map<string, string | true>) {
  return LIVE_DATABASE_CONFIRMATION_FLAGS.some((flagName) => flags.get(flagName) !== true);
}

function runCleanupMainFtsDryRun(dbPath: string) {
  const sqlite = new BetterSqlite3(dbPath, { readonly: true, fileMustExist: true, timeout: 100 });
  try {
    const legacyObjectNamesBefore = listLegacyMainFtsObjectNames(sqlite);
    console.log(JSON.stringify({
      command: 'cleanup-main-fts',
      dbPath,
      droppedTables: [],
      fileMayNotShrink: true,
      legacyObjectNamesAfter: legacyObjectNamesBefore,
      legacyObjectNamesBefore,
      mode: 'dry-run',
      pageCountAfterVacuum: null,
      pageCountBeforeVacuum: null,
      snapshot: null,
      status: legacyObjectNamesBefore.length > 0 ? 'needs-cleanup' : 'already-clean',
      vacuumed: false
    }));
  } finally {
    sqlite.close();
  }
}

function runCleanupMainFtsApply(dbPath: string, flags: Map<string, string | true>) {
  const snapshotDirectory = optionalFlag(flags, 'snapshot-dir')
    ? path.resolve(requireFlag(flags, 'snapshot-dir'))
    : path.join(path.dirname(dbPath), 'foliole-maintenance-snapshots');
  const sqlite = new BetterSqlite3(dbPath, { fileMustExist: true, timeout: 100 });
  try {
    const result = cleanupLegacyMainFtsTables<OperatorSnapshotResult>({
      createSnapshot: () => createOperatorSnapshot({
        destinationDirectory: snapshotDirectory,
        sourceDatabase: sqlite,
        sourcePath: dbPath
      }),
      sourceDatabase: sqlite,
      vacuum: flags.get('no-vacuum') !== true
    });
    const output = {
      command: 'cleanup-main-fts',
      dbPath,
      droppedTables: result.droppedTables,
      fileMayNotShrink: !result.vacuumed,
      legacyObjectNamesAfter: result.legacyObjectNamesAfter,
      legacyObjectNamesBefore: result.legacyObjectNamesBefore,
      mode: 'apply',
      pageCountAfterVacuum: result.pageCountAfterVacuum,
      pageCountBeforeVacuum: result.pageCountBeforeVacuum,
      snapshot: result.snapshot,
      status: result.status,
      vacuumed: result.vacuumed
    };
    console.log(JSON.stringify(output));
    if (result.legacyObjectNamesAfter.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    sqlite.close();
  }
}

function createOperatorSnapshot({
  destinationDirectory,
  sourceDatabase,
  sourcePath
}: {
  destinationDirectory: string;
  sourceDatabase: import('better-sqlite3').Database;
  sourcePath: string;
}): OperatorSnapshotResult {
  fs.mkdirSync(destinationDirectory, { recursive: true });
  const destinationPath = path.join(destinationDirectory, `pre-cleanup-${snapshotTimestamp(new Date())}.db`);
  sourceDatabase.exec(`VACUUM INTO ${toSqliteStringLiteral(destinationPath)}`);
  return {
    destinationPath,
    reason: 'pre-cleanup',
    sourcePath
  };
}

function isDefaultLiveDatabasePath(rawPath: string, resolvedPath: string) {
  const candidates = new Set([
    normalizeDatabasePath(rawPath),
    normalizeDatabasePath(resolvedPath)
  ]);

  try {
    candidates.add(normalizeDatabasePath(fs.realpathSync(resolvedPath)));
  } catch {
    // Missing offline copies are handled by sqlite open; the guard still checks raw paths.
  }

  return DEFAULT_LIVE_DATABASE_PATHS
    .map(normalizeDatabasePath)
    .some((defaultPath) => candidates.has(defaultPath));
}

function normalizeDatabasePath(filePath: string) {
  return filePath.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();
}

function writeCleanupMainFtsError({
  dbPath,
  message,
  mode,
  status
}: {
  dbPath: string;
  message: string;
  mode: 'apply' | 'dry-run';
  status: 'failed' | 'locked' | 'refused-live-database';
}) {
  console.error(JSON.stringify({
    command: 'cleanup-main-fts',
    dbPath,
    error: message,
    mode,
    status
  }));
}

function isSqliteLockError(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';
  const message = formatErrorMessage(error);
  return code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED' || /database is locked|SQLITE_BUSY|SQLITE_LOCKED/i.test(message);
}

function optionalFlag(flags: Map<string, string | true>, flagName: string) {
  const rawValue = flags.get(flagName);
  return typeof rawValue === 'string' ? rawValue.trim() : undefined;
}

function requireFlag(flags: Map<string, string | true>, flagName: string) {
  const rawValue = flags.get(flagName);
  const value = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!value) {
    throw new Error(`missing required flag --${flagName}`);
  }
  return value;
}

function snapshotTimestamp(now: Date) {
  return now.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
}

function toSqliteStringLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function formatErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
