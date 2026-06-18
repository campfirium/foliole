import { createRequire } from 'node:module';
import path from 'node:path';

import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver.ts';
import {
  backupSqliteDatabase,
  resolveDefaultSqliteBackupPath,
  restoreSqliteDatabase
} from '../../electron/database/sqliteBackupRestore.ts';
import {
  countCompletedSearchIndexInvalidationsOlderThan,
  pruneCompletedSearchIndexInvalidations,
  readSearchIndexInvalidationRetentionStatusCounts
} from '../../lib/core/database/searchIndexInvalidationPruning.ts';

import { runCleanupMainFts } from './sqlite-maintenance-cleanup-main-fts.ts';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

const BOOLEAN_FLAGS = new Set(['apply', 'i-have-current-backup', 'i-understand-live-database', 'no-vacuum']);
const DEFAULT_SEARCH_INVALIDATION_RETENTION_DAYS = 30;

async function main() {
  const [command, ...argv] = process.argv.slice(2);

  if (
    command !== 'backup' &&
    command !== 'restore' &&
    command !== 'prune-search-invalidations' &&
    command !== 'cleanup-main-fts'
  ) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const flags = parseFlags(argv);
  const dbPath = requireFlag(flags, 'db-path');

  if (command === 'backup') {
    await runBackup(dbPath, flags);
    return;
  }

  if (command === 'restore') {
    await runRestore(dbPath, flags);
    return;
  }

  if (command === 'cleanup-main-fts') {
    runCleanupMainFts(dbPath, flags);
    return;
  }

  runPruneSearchInvalidations(dbPath, flags);
}

async function runBackup(dbPath: string, flags: Map<string, string | true>) {
  const destinationPath = optionalFlag(flags, 'destination-path') ?? optionalFlag(flags, 'output');
  const result = await backupSqliteDatabase({
    sourcePath: resolvePath(dbPath),
    destinationPath: destinationPath ? resolvePath(destinationPath) : resolveDefaultSqliteBackupPath(dbPath)
  });
  console.log(JSON.stringify(result));
}

async function runRestore(dbPath: string, flags: Map<string, string | true>) {
  const sourcePath = requireFlag(flags, 'source-path');
  const result = await restoreSqliteDatabase({
    sourcePath: resolvePath(sourcePath),
    targetPath: resolvePath(dbPath)
  });
  console.log(JSON.stringify(result));
}

function runPruneSearchInvalidations(dbPath: string, flags: Map<string, string | true>) {
  const resolvedDbPath = resolvePath(dbPath);
  const apply = flags.get('apply') === true;
  const retentionDays = resolveRetentionDays(flags);
  const olderThanIso = resolveOlderThanIso(flags, retentionDays);
  const sqlite = new BetterSqlite3(resolvedDbPath);
  try {
    const driver = createBetterSqlite3Driver(sqlite);
    const statusCounts = readSearchIndexInvalidationRetentionStatusCounts(driver);
    const matchedRows = countCompletedSearchIndexInvalidationsOlderThan(driver, olderThanIso);
    const deletedRows = apply ? pruneCompletedSearchIndexInvalidations(driver, olderThanIso) : 0;
    console.log(JSON.stringify({
      command: 'prune-search-invalidations',
      dbPath: resolvedDbPath,
      deletedRows,
      failedRows: statusCounts.failedRows,
      matchedRows,
      mode: apply ? 'apply' : 'dry-run',
      olderThanIso,
      pendingRows: statusCounts.pendingRows,
      retentionDays,
      runningRows: statusCounts.runningRows
    }));
  } finally {
    sqlite.close();
  }
}

function parseFlags(argv: string[]) {
  const flags = new Map<string, string | true>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith('--')) {
      throw new Error(`unexpected argument: ${token ?? '<empty>'}`);
    }

    const flagName = token.slice(2);
    if (!flagName) {
      throw new Error('empty flag name');
    }

    if (BOOLEAN_FLAGS.has(flagName)) {
      flags.set(flagName, true);
      continue;
    }

    const flagValue = argv[index + 1];
    if (!flagValue || flagValue.startsWith('--')) {
      throw new Error(`missing value for --${flagName}`);
    }

    flags.set(flagName, flagValue);
    index += 1;
  }

  return flags;
}

function requireFlag(flags: Map<string, string | true>, flagName: string) {
  const rawValue = flags.get(flagName);
  const value = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!value) {
    throw new Error(`missing required flag --${flagName}`);
  }
  return value;
}

function optionalFlag(flags: Map<string, string | true>, flagName: string) {
  const rawValue = flags.get(flagName);
  return typeof rawValue === 'string' ? rawValue.trim() : undefined;
}

function resolveRetentionDays(flags: Map<string, string | true>) {
  const value = flags.has('retention-days')
    ? requireFlag(flags, 'retention-days')
    : String(DEFAULT_SEARCH_INVALIDATION_RETENTION_DAYS);
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error('--retention-days must be a positive integer');
  }
  return Number(value);
}

function resolveOlderThanIso(flags: Map<string, string | true>, retentionDays: number) {
  if (flags.has('older-than-iso')) {
    return normalizeOlderThanIso(requireFlag(flags, 'older-than-iso'));
  }
  return new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

function normalizeOlderThanIso(value: string) {
  const trimmed = value.trim();
  if (!trimmed || !/T/.test(trimmed) || !/(Z|[+-]\d{2}:\d{2})$/.test(trimmed)) {
    throw new Error('--older-than-iso must be an ISO timestamp with timezone');
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('--older-than-iso must be a valid ISO timestamp');
  }
  return parsed.toISOString();
}

function resolvePath(filePath: string) {
  return path.resolve(filePath);
}

function printUsage() {
  console.error('usage:');
  console.error('  npm run sqlite:backup -- --db-path <db> [--destination-path <backup>]');
  console.error('  npm run sqlite:restore -- --db-path <db> --source-path <backup>');
  console.error('  npm run sqlite:prune-search-invalidations -- --db-path <db> [--retention-days <days> | --older-than-iso <iso>] [--apply]');
  console.error('  npm run sqlite:cleanup-main-fts -- --db-path <db> [--apply] [--snapshot-dir <dir>] [--no-vacuum] [--i-understand-live-database] [--i-have-current-backup]');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[sqlite-maintenance] ${message}`);
  process.exit(1);
});
