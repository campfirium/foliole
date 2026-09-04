import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver.js';

import { applyAnchorRepairPlan } from './readwise-anchor-repair-apply.js';
import { writeAnchorRepairReceipts } from './readwise-anchor-repair-report.js';
import { buildAnchorRepairPlan } from './readwise-anchor-repair-selection.js';
import type { BodyRecoveryReceipt } from './readwise-anchor-repair-types.js';
import { captureAnchorRepairInvariants, verifyAnchorRepairState } from './readwise-anchor-repair-verification.js';
import { applyAfterVerifiedBackup } from './readwise-body-recovery-apply.js';
import { assertSqliteIntegrity, createVerifiedSqliteBackup } from './sqlite-safety.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredAbsolutePath(name: string) {
  const value = argValue(name);
  if (!value || !path.isAbsolute(value)) throw new Error(`${name} must be an explicit absolute path`);
  return path.resolve(value);
}

function assertReceipt(value: unknown): asserts value is BodyRecoveryReceipt {
  const receipt = value as Partial<BodyRecoveryReceipt> | null;
  if (!receipt || receipt.mode !== 'apply' || typeof receipt.databasePath !== 'string' ||
    !receipt.plan || typeof receipt.plan.planHash !== 'string' || typeof receipt.plan.generatedAt !== 'string' ||
    !Array.isArray(receipt.plan.apply) || !receipt.result?.applied ||
    !Array.isArray(receipt.result.applied.recovered)) {
    throw new Error('invalid_t175_body_recovery_receipt');
  }
}

async function readReceipt(receiptPath: string, dbPath: string) {
  const parsed = JSON.parse(await fs.readFile(receiptPath, 'utf8')) as unknown;
  assertReceipt(parsed);
  if (path.resolve(parsed.databasePath) !== dbPath) throw new Error('source_receipt_database_mismatch');
  return parsed;
}

function hostName(driver: ReturnType<typeof createBetterSqlite3Driver>) {
  const row = driver.queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'host_name'");
  if (!row) throw new Error('desktop_host_name_missing');
  const value = JSON.parse(row.value) as unknown;
  if (typeof value !== 'string' || !value.trim()) throw new Error('desktop_host_name_invalid');
  return value;
}

async function main() {
  const dbPath = requiredAbsolutePath('--db-path');
  const sourceReceiptPath = requiredAbsolutePath('--source-receipt');
  const outputDir = path.resolve(argValue('--receipt-dir') ?? path.join('.tmp', 'artifacts', 't175-readwise-anchor-repair'));
  const apply = process.argv.includes('--apply');
  const now = new Date().toISOString();
  const sourceReceipt = await readReceipt(sourceReceiptPath, dbPath);
  const sqlite = new BetterSqlite3(dbPath);
  sqlite.pragma('foreign_keys = ON');
  const driver = createBetterSqlite3Driver(sqlite);
  try {
    assertSqliteIntegrity(sqlite);
    const plan = buildAnchorRepairPlan(driver, sourceReceipt, now);
    if (!apply) {
      const receipt = await writeAnchorRepairReceipts({ dbPath, mode: 'dry-run', outputDir, plan, sourceReceiptPath });
      console.log(JSON.stringify({ counts: { manualReview: plan.manualReview.length, noRepair: plan.noRepair.length,
        relocate: plan.apply.length, unmap: plan.unmap.length }, planHash: plan.planHash, receipt }, null, 2));
      return;
    }
    const expectedHash = argValue('--expected-plan-hash');
    if (!expectedHash || expectedHash !== plan.planHash) throw new Error(`plan_hash_mismatch:actual=${plan.planHash}`);
    const before = captureAnchorRepairInvariants(driver, plan);
    const protectedApply = await applyAfterVerifiedBackup({
      apply: () => applyAnchorRepairPlan({ driver, hostName: hostName(driver), now, plan }),
      createVerifiedBackup: () => createVerifiedSqliteBackup({
        dbPath, name: 'foliole-t175-before-readwise-anchor-repair',
        openReadonly: (backup) => new BetterSqlite3(backup, { fileMustExist: true, readonly: true }), sqlite, stamp: now
      })
    });
    const verification = verifyAnchorRepairState(driver, plan, before);
    const integrity = assertSqliteIntegrity(sqlite);
    const receipt = await writeAnchorRepairReceipts({ backupPath: protectedApply.backupPath, dbPath, mode: 'apply',
      outputDir, plan, result: { applied: protectedApply.result, integrity,
        mirror: { status: 'pending_desktop_rebuild' }, verification }, sourceReceiptPath });
    console.log(JSON.stringify({ backupPath: protectedApply.backupPath, changed: protectedApply.result.changed.length,
      planHash: plan.planHash, receipt }, null, 2));
  } finally {
    if (sqlite.open) sqlite.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
