import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import Database from 'better-sqlite3';

import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver.js';

import {
  applyReadwiseCutoverRecovery,
  verifyAppliedReadwiseCutoverRecovery
} from './readwise-source-cutover-recovery-apply.js';
import {
  buildReadwiseCutoverRecoveryPlan,
  verifyRecoveryPlan,
  type ReadwiseCutoverRecoveryPlan
} from './readwise-source-cutover-recovery-plan.js';
import { assertSqliteIntegrity, createVerifiedSqliteBackup } from './sqlite-safety.js';

interface Args {
  approved: boolean;
  libraryHome: string;
  manifestPath: string;
  mode: 'apply' | 'plan';
  reportPath: string | null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const expectedDatabase = path.join(args.libraryHome, 'Data', 'foliole.db');
  const databasePath = await fs.realpath(expectedDatabase);
  const resolvedLibraryHome = await fs.realpath(args.libraryHome);
  if (databasePath !== path.join(resolvedLibraryHome, 'Data', 'foliole.db')) {
    throw new Error('readwise_recovery_database_path_not_exact');
  }
  if (args.mode === 'apply') assertNoOpenHandles(databasePath);
  const current = await buildPlan(databasePath, args.libraryHome);
  if (args.mode === 'plan') {
    await writeJson(args.manifestPath, current);
    process.stdout.write(JSON.stringify(summary('planned', current), null, 2) + '\n');
    return;
  }
  if (!args.approved) throw new Error('readwise_recovery_explicit_approval_required');
  const expected = JSON.parse(await fs.readFile(args.manifestPath, 'utf8')) as ReadwiseCutoverRecoveryPlan;
  verifyRecoveryPlan(current, expected);
  const sqlite = openSqlite(databasePath, false);
  try {
    assertSqliteIntegrity(sqlite);
    const stamp = new Date().toISOString();
    const backupPath = await createVerifiedSqliteBackup({
      dbPath: databasePath,
      name: 'readwise-source-cutover-recovery',
      openReadonly: (filePath) => openSqlite(filePath, true),
      sqlite,
      stamp
    });
    const driver = createBetterSqlite3Driver(sqlite);
    applyReadwiseCutoverRecovery(driver, current, stamp);
    assertSqliteIntegrity(sqlite);
    const verification = await verifyAppliedReadwiseCutoverRecovery({
      driver,
      libraryHome: args.libraryHome,
      plan: current
    });
    const report = { ...summary('applied', current), backupPath, verification };
    if (args.reportPath) await writeJson(args.reportPath, report);
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } finally {
    sqlite.close();
  }
}

async function buildPlan(databasePath: string, libraryHome: string) {
  const sqlite = openSqlite(databasePath, true);
  try {
    assertSqliteIntegrity(sqlite);
    return await buildReadwiseCutoverRecoveryPlan({
      databasePath,
      driver: createBetterSqlite3Driver(sqlite),
      libraryHome
    });
  } finally {
    sqlite.close();
  }
}

function openSqlite(filePath: string, readonly: boolean) {
  const sqlite = new Database(filePath, { fileMustExist: true, readonly });
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 1000');
  return sqlite;
}

function assertNoOpenHandles(databasePath: string) {
  const files = [databasePath, databasePath + '-wal', databasePath + '-shm'];
  try {
    const output = execFileSync('/usr/sbin/lsof', ['-t', '--', ...files], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    if (output) {
      throw new Error('readwise_recovery_foliole_must_be_stopped:pids=' + output.replaceAll('\n', ','));
    }
  } catch (error) {
    if (error instanceof Error &&
      error.message.startsWith('readwise_recovery_foliole_must_be_stopped')) {
      throw error;
    }
  }
}

function parseArgs(argv: string[]): Args {
  const mode = argv[0] === 'apply' ? 'apply' : argv[0] === 'plan' ? 'plan' : null;
  const libraryHome = valueAfter(argv, '--library-home');
  const manifestPath = valueAfter(argv, '--manifest');
  if (!mode || !libraryHome || !manifestPath) {
    throw new Error(
      'usage: readwise-source-cutover-recovery.ts <plan|apply> --library-home <path> ' +
      '--manifest <path> [--approved-unedited-duplicates] [--report <path>]'
    );
  }
  return {
    approved: argv.includes('--approved-unedited-duplicates'),
    libraryHome,
    manifestPath,
    mode,
    reportPath: valueAfter(argv, '--report')
  };
}

function valueAfter(argv: string[], name: string) {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1] : null;
  return value && !value.startsWith('--') ? path.resolve(value) : null;
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function summary(status: 'applied' | 'planned', plan: ReadwiseCutoverRecoveryPlan) {
  return {
    counts: {
      annotations: plan.bindings.reduce((total, item) => total + item.annotations.length, 0),
      attachments: plan.attachmentIds.length,
      bound: plan.bindings.filter((item) => item.status === 'bound').length,
      cohort: plan.cohortDocumentIds.length,
      retiredNodes: plan.wrongNodeIds.length,
      suppressed: plan.bindings.filter((item) => item.status === 'suppressed').length
    },
    manifestHash: plan.manifestHash,
    status
  };
}

void main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.stack ?? error.message : String(error)) + '\n');
  process.exitCode = 1;
});
