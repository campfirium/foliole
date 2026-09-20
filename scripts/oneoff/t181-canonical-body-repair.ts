import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver.js';
import { DATABASE_SCHEMA_VERSION } from '../../lib/core/database/databaseSchemaVersion.js';

import { assertSqliteIntegrity, createVerifiedSqliteBackup } from './sqlite-safety.js';
import { applyCanonicalBodyRepairPlan } from './t181-canonical-body-repair-apply.js';
import {
  buildCanonicalBodyRepairPlan, hashValue, safePlanSummary, type RepairPlan
} from './t181-canonical-body-repair-plan.js';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3') as typeof import('better-sqlite3');

function option(argv: string[], name: string) {
  const index = argv.indexOf(name);
  return index < 0 ? null : argv[index + 1] ?? null;
}

function requiredPath(argv: string[], name: string) {
  const value = option(argv, name);
  if (!value || !path.isAbsolute(value)) throw new Error(`${name}_absolute_path_required`);
  return path.resolve(value);
}

function assertNoOtherOpenHandles(dbPath: string) {
  if (process.platform !== 'darwin') throw new Error('writer_guard_requires_macos');
  const result = spawnSync('/usr/sbin/lsof', ['-t', '--', dbPath, `${dbPath}-wal`, `${dbPath}-shm`], {
    encoding: 'utf8'
  });
  if (result.error || ![0, 1].includes(result.status ?? -1)) throw new Error('writer_guard_unavailable');
  const otherPids = new Set(result.stdout.split(/\s+/).filter(Boolean).filter((pid) => pid !== String(process.pid)));
  if (otherPids.size > 0) throw new Error(`database_has_open_handles:${[...otherPids].join(',')}`);
}

function openDb(dbPath: string, readonly: boolean) {
  const sqlite = new Database(dbPath, { fileMustExist: true, readonly });
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 1000');
  if (sqlite.pragma('user_version', { simple: true }) !== DATABASE_SCHEMA_VERSION) {
    sqlite.close();
    throw new Error(`schema_mismatch:run_normal_bootstrap_to_v${DATABASE_SCHEMA_VERSION}`);
  }
  return { sqlite, driver: createBetterSqlite3Driver(sqlite) };
}

function loadHostName(driver: ReturnType<typeof createBetterSqlite3Driver>) {
  const row = driver.queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'host_name'");
  const value = row ? JSON.parse(row.value) as unknown : null;
  if (typeof value !== 'string' || !value.trim()) throw new Error('desktop_host_name_missing');
  return value;
}

function protectedNodeRow(row: Record<string, unknown>, plan: RepairPlan) {
  const parent = plan.candidates.some((item) => item.nodeId === row.id);
  const child = plan.candidates.some((item) => item.children.some((entry) => entry.nodeId === row.id));
  const mutable = parent
    ? new Set(['content', 'body_blob_hash', 'opening_text', 'updated_at',
      'current_version_id', 'last_modified_by_host_name', 'sync_dirty'])
    : child
      ? new Set(['anchor_link', 'image_regions', 'updated_at',
        'current_version_id', 'last_modified_by_host_name', 'sync_dirty'])
      : new Set<string>();
  return Object.fromEntries(Object.entries(row).filter(([key]) => !mutable.has(key)));
}

function captureProtectedDatabase(driver: ReturnType<typeof createBetterSqlite3Driver>, plan: RepairPlan) {
  const tableNames = ['attachments', 'node_attachments', 'node_order', 'pdf_page_text'];
  const tables = tableNames.map((name) => [name,
    driver.queryAll(`SELECT * FROM ${name} ORDER BY rowid`)]);
  const nodes = driver.queryAll<Record<string, unknown>>('SELECT * FROM nodes ORDER BY id')
    .map((row) => protectedNodeRow(row, plan));
  return { nodes: hashValue(nodes), tables: hashValue(tables) };
}

async function captureProtected(input: {
  assetsDir: string;
  driver: ReturnType<typeof createBetterSqlite3Driver>;
  plan: RepairPlan;
}) {
  const database = captureProtectedDatabase(input.driver, input.plan);
  const names = (await fs.readdir(input.assetsDir)).sort();
  const assets = await Promise.all(names.map(async (name) => {
    const stat = await fs.lstat(path.join(input.assetsDir, name));
    return [name, stat.size, stat.mode, stat.mtimeMs, stat.isSymbolicLink()];
  }));
  return { assets: hashValue(assets), ...database };
}

async function buildPlan(dbPath: string, assetsDir: string) {
  const { sqlite, driver } = openDb(dbPath, true);
  try {
    assertSqliteIntegrity(sqlite);
    return await buildCanonicalBodyRepairPlan({ assetsDir, driver });
  } finally {
    sqlite.close();
  }
}

async function writeReceipt(receiptDir: string, name: string, value: unknown) {
  await fs.mkdir(receiptDir, { recursive: true });
  const target = path.join(receiptDir, name);
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  return target;
}

async function apply(input: { assetsDir: string; dbPath: string; expectedPlanHash: string; receiptDir: string }) {
  assertNoOtherOpenHandles(input.dbPath);
  const frozen = await buildPlan(input.dbPath, input.assetsDir);
  if (frozen.planHash !== input.expectedPlanHash) throw new Error('plan_hash_mismatch');
  if (frozen.candidates.length === 0) return { status: 'already_canonical', planHash: frozen.planHash };
  try {
    await fs.access(path.join(input.receiptDir, 'after-manifest.json'));
    throw new Error('after_receipt_already_exists');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  const { sqlite, driver } = openDb(input.dbPath, false);
  try {
    assertNoOtherOpenHandles(input.dbPath);
    assertSqliteIntegrity(sqlite);
    const before = await captureProtected({ assetsDir: input.assetsDir, driver, plan: frozen });
    const stamp = new Date().toISOString();
    const backupPath = await createVerifiedSqliteBackup({
      dbPath: input.dbPath, name: 'foliole-t181-4-before-canonical-body-repair',
      openReadonly: (filePath) => new Database(filePath, { fileMustExist: true, readonly: true }),
      sqlite, stamp
    });
    const rebuilt = await buildCanonicalBodyRepairPlan({ assetsDir: input.assetsDir, driver });
    if (rebuilt.planHash !== frozen.planHash) throw new Error('repair_state_drifted_after_backup');
    assertNoOtherOpenHandles(input.dbPath);
    const versions = applyCanonicalBodyRepairPlan({
      driver, hostName: loadHostName(driver), now: stamp, plan: frozen,
      verifyBeforeCommit: () => {
        const database = captureProtectedDatabase(driver, frozen);
        if (database.nodes !== before.nodes || database.tables !== before.tables) {
          throw new Error('protected_database_invariant_changed');
        }
      }
    });
    assertSqliteIntegrity(sqlite);
    const after = await captureProtected({ assetsDir: input.assetsDir, driver, plan: frozen });
    if (JSON.stringify(after) !== JSON.stringify(before)) throw new Error('protected_invariant_changed');
    const residual = await buildCanonicalBodyRepairPlan({ assetsDir: input.assetsDir, driver });
    if (residual.candidates.length !== 0) throw new Error('repair_not_idempotent');
    const receipt = await writeReceipt(input.receiptDir, 'after-manifest.json', {
      backupPath, before, after, plan: safePlanSummary(frozen), versions,
      verification: { integrity: 'ok', residualCandidates: 0, protectedUnchanged: true }
    });
    return { status: 'applied', backupPath, receipt, versions: versions.length };
  } finally {
    sqlite.close();
  }
}

export async function runT181CanonicalBodyRepair(argv = process.argv.slice(2)) {
  const mode = argv[0];
  if (mode !== 'preflight' && mode !== 'apply') {
    throw new Error('usage: <preflight|apply> --library-home <absolute> --receipt-dir <absolute> [--expected-plan-hash <hash> --writer-stopped]');
  }
  const libraryHome = requiredPath(argv, '--library-home');
  const receiptDir = requiredPath(argv, '--receipt-dir');
  const dbPath = path.join(libraryHome, 'Data', 'foliole.db');
  const assetsDir = path.join(libraryHome, 'Assets');
  if (mode === 'preflight') {
    const plan = await buildPlan(dbPath, assetsDir);
    const summary = safePlanSummary(plan);
    const receipt = await writeReceipt(receiptDir, 'before-manifest.json', {
      databasePath: dbPath, assetsDir, schemaVersion: DATABASE_SCHEMA_VERSION,
      plan: summary
    });
    return { status: 'preflight', receipt, nodeCount: summary.nodeCount,
      tokenCount: summary.tokenCount, childCount: summary.childCount,
      planHash: summary.planHash };
  }
  if (!argv.includes('--writer-stopped')) throw new Error('writer_stopped_confirmation_required');
  const expectedPlanHash = option(argv, '--expected-plan-hash');
  if (!expectedPlanHash || !/^[a-f0-9]{64}$/.test(expectedPlanHash)) {
    throw new Error('expected_plan_hash_required');
  }
  return apply({ assetsDir, dbPath, expectedPlanHash, receiptDir });
}

if (process.env.FOLIOLE_T181_CANONICAL_REPAIR_CLI === '1') {
  await runT181CanonicalBodyRepair().then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.stack : String(error));
      process.exitCode = 1;
    });
}
