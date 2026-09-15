import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver.js';

import {
  applyDuplicateRootRepair,
  verifyDuplicateRootRepair
} from './readwise-epub-duplicate-root-apply.js';
import { buildDuplicateRootRepairPlan } from './readwise-epub-duplicate-root-plan.js';
import type { DuplicateRootRepairPlan } from './readwise-epub-duplicate-root-types.js';
import { assertSqliteIntegrity, createVerifiedSqliteBackup } from './sqlite-safety.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function absoluteArg(name: string) {
  const value = arg(name);
  if (!value || !path.isAbsolute(value)) throw new Error(`${name} must be an explicit absolute path`);
  return path.resolve(value);
}

async function writeReceipt(directory: string, name: string, payload: unknown) {
  await fs.mkdir(directory, { recursive: true });
  const target = path.join(directory, name);
  await fs.writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, { flag: 'wx' });
  return target;
}

async function main() {
  const dbPath = absoluteArg('--db-path');
  const outputDir = path.resolve(arg('--receipt-dir') ?? '.tmp/artifacts/readwise-epub-duplicate-root-repair');
  const verifyPath = arg('--verify-plan-path');
  const apply = process.argv.includes('--apply');
  if (verifyPath) return verifySavedPlan(dbPath, path.resolve(verifyPath));
  if (apply && !process.argv.includes('--writer-stopped')) throw new Error('--writer-stopped is required for apply');
  const sqlite = new BetterSqlite3(dbPath, { fileMustExist: true, readonly: !apply });
  const driver = createBetterSqlite3Driver(sqlite);
  try {
    assertSqliteIntegrity(sqlite);
    const plan = buildDuplicateRootRepairPlan(driver);
    const stamp = plan.generatedAt.replaceAll(':', '-');
    if (!apply) {
      const receipt = await writeReceipt(outputDir, `dry-run-${stamp}.json`, {
        databasePath: dbPath, mode: 'dry-run', plan
      });
      console.log(JSON.stringify({ planHash: plan.planHash, receipt, summary: plan.summary }, null, 2));
      return;
    }
    const expected = arg('--expected-plan-hash');
    if (!expected || expected !== plan.planHash) throw new Error(`plan_hash_mismatch:actual=${plan.planHash}`);
    const backupPath = await createVerifiedSqliteBackup({
      dbPath, name: 'foliole-before-readwise-epub-duplicate-root-repair',
      openReadonly: (target) => new BetterSqlite3(target, { fileMustExist: true, readonly: true }),
      sqlite, stamp: plan.generatedAt
    });
    const frozen = buildDuplicateRootRepairPlan(driver, plan.generatedAt);
    if (frozen.planHash !== plan.planHash) throw new Error('readwise_duplicate_root_state_drifted_after_backup');
    const result = applyDuplicateRootRepair(driver, plan);
    const verification = verifyDuplicateRootRepair(driver, plan);
    const integrity = assertSqliteIntegrity(sqlite);
    const receipt = await writeReceipt(outputDir, `applied-${stamp}.json`, {
      backupPath, databasePath: dbPath, integrity, mode: 'apply', plan, result, verification
    });
    console.log(JSON.stringify({ backupPath, receipt, result, verification }, null, 2));
  } finally {
    if (sqlite.open) sqlite.close();
  }
}

async function verifySavedPlan(dbPath: string, planPath: string) {
  const payload = JSON.parse(await fs.readFile(planPath, 'utf8')) as { plan?: DuplicateRootRepairPlan };
  if (!payload.plan) throw new Error('readwise_duplicate_verify_plan_missing');
  const sqlite = new BetterSqlite3(dbPath, { fileMustExist: true, readonly: true });
  try {
    const driver = createBetterSqlite3Driver(sqlite);
    const integrity = assertSqliteIntegrity(sqlite);
    const verification = verifyDuplicateRootRepair(driver, payload.plan);
    console.log(JSON.stringify({ integrity, mode: 'verify', verification }, null, 2));
  } finally {
    sqlite.close();
  }
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
