import { createRequire } from 'node:module';
import path from 'node:path';

import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver.js';
import { processSearchIndexInvalidations, readSearchIndexInvalidationBacklog } from '../../lib/core/database/searchIndexInvalidations.js';

import { applyAfterVerifiedBackup, applyRecoveryPlan } from './readwise-body-recovery-apply.js';
import { writeRecoveryReceipts } from './readwise-body-recovery-report.js';
import { buildRecoveryPlan } from './readwise-body-recovery-selection.js';
import { captureRecoveryInvariants, verifyRecoveredState } from './readwise-body-recovery-verification.js';
import { assertSqliteIntegrity, createVerifiedSqliteBackup } from './sqlite-safety.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredDatabasePath() {
  const value = argValue('--db-path');
  if (!value || !path.isAbsolute(value)) throw new Error('--db-path must be an explicit absolute path');
  return path.resolve(value);
}

function openDatabase(dbPath: string) {
  const sqlite = new BetterSqlite3(dbPath);
  sqlite.pragma('foreign_keys = ON');
  sqlite.prepare('ATTACH DATABASE ? AS search').run(path.join(path.dirname(dbPath), 'foliole-index.db'));
  return { driver: createBetterSqlite3Driver(sqlite), sqlite };
}

function hostName(driver: ReturnType<typeof createBetterSqlite3Driver>) {
  const row = driver.queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'host_name'");
  if (!row) throw new Error('desktop_host_name_missing');
  const value = JSON.parse(row.value) as unknown;
  if (typeof value !== 'string' || !value.trim()) throw new Error('desktop_host_name_invalid');
  return value;
}

function settleSearch(driver: ReturnType<typeof createBetterSqlite3Driver>) {
  for (let index = 0; index < 20; index += 1) {
    const backlog = readSearchIndexInvalidationBacklog(driver);
    if (backlog.total_count === 0) return { backlog, passes: index };
    const result = processSearchIndexInvalidations(driver, 500);
    if (result.failed > 0) throw new Error('search_index_refresh_failed');
  }
  throw new Error('search_index_refresh_did_not_settle');
}

async function main() {
  const dbPath = requiredDatabasePath();
  const outputDir = path.resolve(argValue('--receipt-dir') ?? path.join('.tmp', 'artifacts', 't175-readwise-body-recovery'));
  const apply = process.argv.includes('--apply');
  const now = new Date().toISOString();
  const { driver, sqlite } = openDatabase(dbPath);
  let backupPath: string | undefined;
  try {
    assertSqliteIntegrity(sqlite);
    const plan = buildRecoveryPlan(driver, now);
    if (!apply) {
      const receipt = await writeRecoveryReceipts({ dbPath, mode: 'dry-run', outputDir, plan });
      console.log(JSON.stringify({ counts: { apply: plan.apply.length, manualReview: plan.manualReview.length,
        noRepair: plan.noRepair.length }, planHash: plan.planHash, receipt }, null, 2));
      return;
    }
    const expectedHash = argValue('--expected-plan-hash');
    if (!expectedHash || expectedHash !== plan.planHash) throw new Error(`plan_hash_mismatch:actual=${plan.planHash}`);
    const before = captureRecoveryInvariants(driver, plan);
    const protectedApply = await applyAfterVerifiedBackup({
      apply: () => applyRecoveryPlan({ driver, hostName: hostName(driver), now, plan }),
      createVerifiedBackup: () => createVerifiedSqliteBackup({
        dbPath, name: 'foliole-t175-before-readwise-recovery',
        openReadonly: (backup) => new BetterSqlite3(backup, { fileMustExist: true, readonly: true }), sqlite, stamp: now
      })
    });
    backupPath = protectedApply.backupPath;
    const applied = protectedApply.result;
    const search = settleSearch(driver);
    const verification = verifyRecoveredState(driver, plan, before);
    assertSqliteIntegrity(sqlite);
    const receipt = await writeRecoveryReceipts({ backupPath, dbPath, mode: 'apply', outputDir, plan,
      result: { applied, integrity: { foreignKeyViolations: 0, integrityCheck: 'ok' },
        mirror: { status: 'pending_desktop_rebuild' }, search, verification } });
    console.log(JSON.stringify({ applied: applied.recovered.length, backupPath, planHash: plan.planHash, receipt }, null, 2));
  } finally {
    if (sqlite.open) sqlite.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
