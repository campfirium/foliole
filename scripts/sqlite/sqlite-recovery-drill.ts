import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import {
  backupSqliteDatabase,
  restoreSqliteDatabase,
  type SqliteBackupResult,
  type SqliteRestoreResult
} from '../../electron/database/sqliteBackupRestore.ts';

import { createDrillSchema } from './sqlite-recovery-drill-schema.ts';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

const EXPECTED_TABLES = ['nodes', 'node_order', 'node_review', 'review_log', 'workspace_meta'] as const;
const COUNT_TABLES = ['nodes', 'node_order', 'node_review', 'review_log'] as const;

export interface RecoveryDrillOptions {
  backupPath?: string;
  restorePath?: string;
  sourcePath?: string;
  workDir?: string;
}

interface RecoverySummary {
  activeNodeCount: number;
  deletedNodeCount: number;
  integrityCheck: string;
  nodeOrderCount: number;
  nodeReviewCount: number;
  reviewLogCount: number;
  tableCounts: Record<string, number>;
  tableNames: string[];
  totalNodeCount: number;
}

export interface RecoveryDrillReport {
  backup: SqliteBackupResult;
  backupPath: string;
  checks: Array<{ actual: unknown; expected: unknown; name: string; status: 'failed' | 'ok' }>;
  restore: SqliteRestoreResult;
  restorePath: string;
  restored: RecoverySummary;
  source: RecoverySummary;
  sourcePath: string;
  status: 'failed' | 'ok';
}

export async function runRecoveryDrill(options: RecoveryDrillOptions = {}): Promise<RecoveryDrillReport> {
  const workDir = path.resolve(options.workDir ?? await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-recovery-drill-')));
  await fs.mkdir(workDir, { recursive: true });

  const sourcePath = path.resolve(options.sourcePath ?? path.join(workDir, 'source.db'));
  const backupPath = path.resolve(options.backupPath ?? path.join(workDir, 'backup.db'));
  const restorePath = path.resolve(options.restorePath ?? path.join(workDir, 'restored.db'));

  await assertPathDoesNotExist(backupPath, 'backup');
  await assertPathDoesNotExist(restorePath, 'restore target');

  if (!options.sourcePath) {
    await createFixtureDatabase(sourcePath);
  }

  const source = summarizeDatabase(sourcePath);
  const backup = await backupSqliteDatabase({ sourcePath, destinationPath: backupPath });
  const restore = await restoreSqliteDatabase({ sourcePath: backupPath, targetPath: restorePath });
  const restored = summarizeDatabase(restorePath);
  const checks = buildChecks(source, restored);

  return {
    backup,
    backupPath,
    checks,
    restore,
    restorePath,
    restored,
    source,
    sourcePath,
    status: checks.every((check) => check.status === 'ok') ? 'ok' : 'failed'
  };
}

async function assertPathDoesNotExist(filePath: string, label: string) {
  try {
    await fs.access(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`${label} path already exists: ${filePath}`);
}

async function createFixtureDatabase(databasePath: string) {
  await fs.mkdir(path.dirname(databasePath), { recursive: true });
  const sqlite = new BetterSqlite3(databasePath);
  try {
    createDrillSchema(sqlite);
    sqlite.exec(`
      INSERT INTO nodes (id, parent_id, kind, title, is_title_manual, content, reveal, position, created_at, updated_at, deleted_at)
      VALUES
        ('node-root', NULL, 'topic', 'fixture-root', 1, '# fixture root body', NULL, 0, '2026-03-14T10:00:00.000Z', '2026-03-14T10:00:00.000Z', NULL),
        ('node-qa', NULL, 'item', 'fixture-qa', 1, 'fixture prompt body', 'fixture answer body', 1, '2026-03-14T10:00:00.000Z', '2026-03-14T10:02:00.000Z', NULL),
        ('node-trash', NULL, 'topic', 'fixture-trash', 1, '# deleted fixture body', NULL, 2, '2026-03-14T10:00:00.000Z', '2026-03-14T10:03:00.000Z', '2026-03-14T10:03:00.000Z');
      INSERT INTO node_order (node_id, position) VALUES ('node-root', 0), ('node-qa', 1);
      INSERT INTO node_review (
        node_id, due, last_review_at, state, stability, difficulty, elapsed_days, scheduled_days, reps, lapses
      ) VALUES ('node-qa', '2026-03-17T10:02:00.000Z', '2026-03-14T10:02:00.000Z', 1, 2.7, 3.4, 1, 3, 1, 0);
      INSERT INTO review_log (
        id, op_id, device_id, node_id, grade, scheduler_version, reviewed_at,
        due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after
      ) VALUES (
        'review-log-1', 'op-review-1', 'drill-device', 'node-qa', 3, 'ts-fsrs@4:drill',
        '2026-03-14T10:02:00.000Z', '2026-03-14T10:00:00.000Z', 0, 0,
        '2026-03-17T10:02:00.000Z', 2.7, 3.4
      );
      INSERT INTO workspace_meta (key, value, updated_at)
      VALUES ('active_node_id', 'node-root', '2026-03-14T10:00:00.000Z');
    `);
  } finally {
    sqlite.close();
  }
}

function summarizeDatabase(databasePath: string): RecoverySummary {
  const sqlite = new BetterSqlite3(databasePath, { fileMustExist: true, readonly: true });
  try {
    const tableCounts = Object.fromEntries(COUNT_TABLES.map((table) => [table, countRows(sqlite, table)]));
    return {
      activeNodeCount: countWhere(sqlite, 'nodes', 'deleted_at IS NULL'),
      deletedNodeCount: countWhere(sqlite, 'nodes', 'deleted_at IS NOT NULL'),
      integrityCheck: readIntegrityCheck(sqlite),
      nodeOrderCount: tableCounts.node_order,
      nodeReviewCount: tableCounts.node_review,
      reviewLogCount: tableCounts.review_log,
      tableCounts,
      tableNames: readTableNames(sqlite),
      totalNodeCount: tableCounts.nodes
    };
  } finally {
    sqlite.close();
  }
}

function buildChecks(source: RecoverySummary, restored: RecoverySummary) {
  const checks = [
    buildCheck('source integrity', 'ok', source.integrityCheck),
    buildCheck('restored integrity', 'ok', restored.integrityCheck),
    ...EXPECTED_TABLES.map((table) => buildCheck(`table exists: ${table}`, true, restored.tableNames.includes(table))),
    buildCheck('table counts', source.tableCounts, restored.tableCounts),
    buildCheck('active nodes', source.activeNodeCount, restored.activeNodeCount),
    buildCheck('deleted nodes', source.deletedNodeCount, restored.deletedNodeCount),
    buildCheck('review rows', source.reviewLogCount, restored.reviewLogCount)
  ];
  return checks;
}

function buildCheck(name: string, expected: unknown, actual: unknown) {
  return { actual, expected, name, status: deepEqual(expected, actual) ? 'ok' as const : 'failed' as const };
}

function countRows(sqlite: import('better-sqlite3').Database, table: string) {
  return countWhere(sqlite, table, '1 = 1');
}

function countWhere(sqlite: import('better-sqlite3').Database, table: string, where: string) {
  return (sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`).get() as { count: number }).count;
}

function readIntegrityCheck(sqlite: import('better-sqlite3').Database) {
  return (sqlite.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check;
}

function readTableNames(sqlite: import('better-sqlite3').Database) {
  return (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>).map((row) => row.name);
}

function deepEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function parseOptions(argv: string[]): RecoveryDrillOptions {
  const options: RecoveryDrillOptions = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--help') {
      printUsage();
      process.exit(0);
    }
    if (!key?.startsWith('--') || !value || value.startsWith('--')) throw new Error(`invalid argument: ${key ?? '<empty>'}`);
    if (key === '--work-dir') options.workDir = value;
    else if (key === '--source-path') options.sourcePath = value;
    else if (key === '--backup-path') options.backupPath = value;
    else if (key === '--restore-path') options.restorePath = value;
    else throw new Error(`unknown argument: ${key}`);
    index += 1;
  }
  return options;
}

function printUsage() {
  console.error('usage: node scripts/electron-sqlite-runner.mjs scripts/sqlite/sqlite-recovery-drill.ts [--work-dir <dir>] [--source-path <test.db>] [--backup-path <new.db>] [--restore-path <new.db>]');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/sqlite/sqlite-recovery-drill.ts')) {
  runRecoveryDrill(parseOptions(process.argv.slice(2)))
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = report.status === 'ok' ? 0 : 1;
    })
    .catch((error) => {
      console.error(`[sqlite-recovery-drill] ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}
