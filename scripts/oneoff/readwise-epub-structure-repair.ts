import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver.js';

import {
  applyReadwiseEpubStructureRepair,
  verifyReadwiseEpubStructureRepair
} from './readwise-epub-structure-repair-apply.js';
import { buildReadwiseEpubStructureRepairPlan } from './readwise-epub-structure-repair-plan.js';
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

function readSourceSnapshot(sourcePath: string) {
  const source = new BetterSqlite3(sourcePath, { fileMustExist: true, readonly: true });
  try {
    assertSqliteIntegrity(source);
    const rows = source.prepare(
      "SELECT remote_id, payload_json FROM readwise_api_import_stage WHERE record_kind = 'candidate-reader-v3'"
    ).all() as Array<{ payload_json: string; remote_id: string }>;
    return new Map(rows.flatMap((row): Array<[string, string]> => {
      const payload = JSON.parse(row.payload_json) as { category?: unknown; htmlContent?: unknown; title?: unknown };
      return payload.category === 'epub' && typeof payload.htmlContent === 'string'
        ? [[row.remote_id, {
          html: payload.htmlContent,
          title: typeof payload.title === 'string' ? payload.title : row.remote_id
        }]] : [];
    }));
  } finally {
    source.close();
  }
}

async function writeReceipt(outputDir: string, name: string, payload: unknown) {
  await fs.mkdir(outputDir, { recursive: true });
  const target = path.join(outputDir, name);
  await fs.writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, { flag: 'wx' });
  return target;
}

function planSummary(plan: ReturnType<typeof buildReadwiseEpubStructureRepairPlan>) {
  const scopedIds = new Set(plan.books.map((book) => book.documentId));
  return {
    books: plan.books.map((book) => ({
      attachmentCopies: book.attachmentCopies,
      bodyCoverageHashes: {
        current: book.currentCoverageHash, projected: book.newCoverageHash, source: book.sourceCoverageHash
      },
      createdNodeIds: [],
      documentId: book.documentId,
      highlightPlacements: book.highlights.map((highlight) => ({
        nodeId: highlight.nodeId, parentId: highlight.parentId,
        resolved: Boolean((JSON.parse(highlight.anchorLink) as { locator?: unknown }).locator)
      })),
      isTitleManual: book.bodies.map((body) => ({ nodeId: body.nodeId, value: body.isTitleManual })),
      moves: book.moves,
      newStructureCount: book.headingCount,
      oldStructureCount: book.headingCount + book.staleNodeIds.length,
      retiredNodeIds: book.staleNodeIds,
      reusedNodeIds: book.reusedNodeIds,
      title: book.title
    })),
    counts: plan.counts,
    corpusAudit: plan.corpusAudit,
    generatedAt: plan.generatedAt,
    extraCorpusDocumentIds: plan.corpusAudit.books.filter((book) => !scopedIds.has(book.documentId))
      .map((book) => book.documentId),
    planHash: plan.planHash,
    protection: plan.protection
  };
}

async function main() {
  const dbPath = requiredAbsolutePath('--db-path');
  const sourcePath = requiredAbsolutePath('--source-db-path');
  const outputDir = path.resolve(argValue('--receipt-dir') ?? '.tmp/artifacts/readwise-epub-structure-repair');
  const apply = process.argv.includes('--apply');
  if (apply && !process.argv.includes('--writer-stopped')) throw new Error('--writer-stopped is required for apply');
  const sqlite = new BetterSqlite3(dbPath, { fileMustExist: true, readonly: !apply });
  const driver = createBetterSqlite3Driver(sqlite);
  try {
    assertSqliteIntegrity(sqlite);
    const sourceByDocumentId = readSourceSnapshot(sourcePath);
    const plan = buildReadwiseEpubStructureRepairPlan({ driver, sourceByDocumentId });
    if (!apply) {
      const receipt = await writeReceipt(outputDir, `dry-run-${plan.generatedAt.replaceAll(':', '-')}.json`, {
        databasePath: dbPath, mode: 'dry-run', sourcePath, ...planSummary(plan)
      });
      console.log(JSON.stringify({ receipt, ...planSummary(plan) }, null, 2));
      return;
    }
    const expectedPlanHash = argValue('--expected-plan-hash');
    if (!expectedPlanHash || expectedPlanHash !== plan.planHash) {
      throw new Error(`plan_hash_mismatch:actual=${plan.planHash}`);
    }
    const backupPath = await createVerifiedSqliteBackup({
      dbPath, name: 'foliole-before-readwise-epub-structure-repair',
      openReadonly: (target) => new BetterSqlite3(target, { fileMustExist: true, readonly: true }),
      sqlite, stamp: plan.generatedAt
    });
    const frozen = buildReadwiseEpubStructureRepairPlan({
      driver, generatedAt: plan.generatedAt, sourceByDocumentId
    });
    if (frozen.planHash !== plan.planHash) throw new Error('readwise_epub_repair_state_drifted_after_backup');
    const result = applyReadwiseEpubStructureRepair(driver, plan);
    const verification = verifyReadwiseEpubStructureRepair(driver, plan);
    const integrity = assertSqliteIntegrity(sqlite);
    const receipt = await writeReceipt(outputDir, `applied-${plan.generatedAt.replaceAll(':', '-')}.json`, {
      backupPath, databasePath: dbPath, integrity, mode: 'apply', result, sourcePath,
      summary: planSummary(plan), verification
    });
    console.log(JSON.stringify({ backupPath, receipt, result, verification }, null, 2));
  } finally {
    if (sqlite.open) sqlite.close();
  }
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
