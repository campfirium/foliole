import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { createRequire as nodeCreateRequire } from 'node:module';
import path from 'node:path';

import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver.js';

import { assertSqliteIntegrity, createVerifiedSqliteBackup } from './sqlite-safety.js';
import { applyJpegBodyRepairPlan } from './t181-jpeg-body-repair-apply.js';
import {
  buildJpegBodyRepairPlan,
  captureJpegBodyRepairInvariants
} from './t181-jpeg-body-repair-plan.js';

const require = nodeCreateRequire(import.meta.url);
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

function openDatabase(dbPath: string, readonly = false) {
  const sqlite = new BetterSqlite3(dbPath, { fileMustExist: true, readonly });
  sqlite.pragma('foreign_keys = ON');
  if (!readonly) sqlite.prepare('ATTACH DATABASE ? AS search').run(path.join(path.dirname(dbPath), 'foliole-index.db'));
  return { driver: createBetterSqlite3Driver(sqlite), sqlite };
}

function loadHostName(driver: ReturnType<typeof createBetterSqlite3Driver>) {
  const row = driver.queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'host_name'");
  const value = row ? JSON.parse(row.value) as unknown : null;
  if (typeof value !== 'string' || !value.trim()) throw new Error('desktop_host_name_missing');
  return value;
}

function sameInvariants(before: object, after: object) {
  return Object.entries(before).every(([key, value]) => after[key as keyof typeof after] === value);
}

function receiptPlan(plan: Awaited<ReturnType<typeof buildJpegBodyRepairPlan>>) {
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  return {
    candidates: plan.candidates.map((candidate) => ({
      bodyHash: candidate.bodyHash, currentVersionId: candidate.currentVersionId,
      jpegKeys: candidate.jpegKeys, nextBodyHash: hash(candidate.nextContent), nodeId: candidate.nodeId,
      previousBodyHash: hash(candidate.previousContent), updatedAt: candidate.updatedAt
    })),
    generatedAt: plan.generatedAt, nodeCount: plan.candidates.length, planHash: plan.planHash,
    syncGroupDigest: plan.syncGroupDigest, tokenCount: plan.tokenCount
  };
}

async function writeReceipt(outputDir: string, name: string, payload: unknown) {
  await fs.mkdir(outputDir, { recursive: true });
  const target = path.join(outputDir, name);
  await fs.writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, { flag: 'wx' });
  return target;
}

export async function runT181JpegBodyRepair() {
  const dbPath = requiredAbsolutePath('--db-path');
  const assetsDir = requiredAbsolutePath('--assets-dir');
  const outputDir = path.resolve(argValue('--receipt-dir') ?? '.tmp/artifacts/t181-3-jpeg-body-repair');
  const apply = process.argv.includes('--apply');
  if (apply && !process.argv.includes('--writer-stopped')) throw new Error('--writer-stopped is required for apply');
  const { driver, sqlite } = openDatabase(dbPath, !apply);
  try {
    assertSqliteIntegrity(sqlite);
    const plan = await buildJpegBodyRepairPlan({ assetsDir, driver });
    const invariants = await captureJpegBodyRepairInvariants({
      assetsDir, driver, targetIds: plan.candidates.map((candidate) => candidate.nodeId)
    });
    if (!apply) {
      const receipt = await writeReceipt(outputDir, 'before-manifest.json', {
        databasePath: dbPath, invariants, mode: 'preflight', plan: receiptPlan(plan)
      });
      console.log(JSON.stringify({ receipt, ...receiptPlan(plan) }, null, 2));
      return;
    }
    const expectedPlanHash = argValue('--expected-plan-hash');
    if (!expectedPlanHash || expectedPlanHash !== plan.planHash) {
      throw new Error(`plan_hash_mismatch:actual=${plan.planHash}`);
    }
    const backupPath = await createVerifiedSqliteBackup({
      dbPath, name: 'foliole-t181-3-before-jpeg-body-repair',
      openReadonly: (target) => new BetterSqlite3(target, { fileMustExist: true, readonly: true }),
      sqlite, stamp: plan.generatedAt
    });
    const frozen = await buildJpegBodyRepairPlan({ assetsDir, driver, generatedAt: plan.generatedAt });
    if (frozen.planHash !== plan.planHash) throw new Error('repair_state_drifted_after_backup');
    const versions = applyJpegBodyRepairPlan({
      driver, hostName: loadHostName(driver), now: new Date().toISOString(), plan
    });
    assertSqliteIntegrity(sqlite);
    const after = await captureJpegBodyRepairInvariants({
      assetsDir, driver, targetIds: plan.candidates.map((candidate) => candidate.nodeId)
    });
    if (!sameInvariants(invariants, after)) throw new Error('protected_invariant_changed');
    const receipt = await writeReceipt(outputDir, 'after-manifest.json', {
      backupPath, databasePath: dbPath, invariants: { after, before: invariants }, mode: 'apply',
      plan: receiptPlan(plan), versions
    });
    console.log(JSON.stringify({ backupPath, receipt, versions }, null, 2));
  } finally {
    if (sqlite.open) sqlite.close();
  }
}

if (process.env.FOLIOLE_T181_CLI_AUTO_RUN === '1') {
  await runT181JpegBodyRepair().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
