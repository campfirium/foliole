import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildCanonicalAttachmentMigrationPlan } from '../../electron/attachments/canonicalAttachmentMigrationPlan.js';
import {
  finalizeHtmlOrphanRetirement,
  locateHtmlOrphanRetirement,
  prepareHtmlOrphanRetirement,
  readHtmlOrphanRetirementJournal,
  restoreHtmlOrphanFiles,
  stageHtmlOrphanFiles,
  verifyHtmlOrphanFilesStaged,
  writeRetirementStage,
  type LocalRetirementTarget
} from '../../electron/attachments/htmlOrphanRetirementJournal.js';

import {
  applyLocalAttachmentRetirement,
  assertLocalRetirementPreconditions,
  captureRetirementDatabaseSnapshot,
  restoreRetirementDatabase,
  type RetirementDatabaseSnapshot
} from './htmlOrphanRetirementDatabase.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

interface PreflightReceipt {
  input: { assetsDir: string; databasePath: string };
  plan: ReturnType<typeof buildCanonicalAttachmentMigrationPlan>;
  productionState: { unchanged: boolean };
  version: number;
}

interface ApplyArgs { assets: string; database: string; preflight: string }
type ParsedArgs =
  | { database: string; journal: string; mode: 'finalize' | 'restore' }
  | (ApplyArgs & { mode: 'apply' });

function usage() {
  return new Error('usage: apply --database <path> --assets <path> --preflight <path> | ' +
    '<finalize|restore> --database <path> --journal <path>');
}

function parseArgs(argv: string[]): ParsedArgs {
  const mode = argv[0];
  const values = new Map<string, string>();
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key || !value || values.has(key)) throw usage();
    values.set(key, value);
  }
  if (mode === 'finalize' || mode === 'restore') {
    const result = { database: values.get('--database') ?? '', journal: values.get('--journal') ?? '' };
    if (!Object.values(result).every(path.isAbsolute) || values.size !== 2) throw usage();
    return { ...result, mode };
  }
  if (mode !== 'apply') throw usage();
  const result = { assets: values.get('--assets') ?? '', database: values.get('--database') ?? '',
    preflight: values.get('--preflight') ?? '' };
  if (!Object.values(result).every(path.isAbsolute) || values.size !== 3) throw usage();
  return { ...result, mode };
}

function loadReceipt(args: ApplyArgs) {
  const receipt = JSON.parse(fs.readFileSync(args.preflight, 'utf8')) as PreflightReceipt;
  if (receipt.version !== 2) throw new Error('Attachment retirement preflight version is unsupported.');
  if (!receipt.productionState?.unchanged) throw new Error('Attachment retirement preflight changed production state.');
  if (receipt.plan.residualBlockers.length) {
    throw new Error(`Attachment retirement preflight has residual blockers: ${JSON.stringify(
      receipt.plan.residualBlockers
    )}`);
  }
  if (path.resolve(receipt.input.databasePath) !== path.resolve(args.database) ||
      path.resolve(receipt.input.assetsDir) !== path.resolve(args.assets)) throw new Error('Attachment retirement path mismatch.');
  return receipt;
}

function targetsFromPlan(plan: PreflightReceipt['plan']) {
  return plan.items.filter((item) => item.decision === 'html_orphan_delete').map((item) => {
    const { row } = item;
    if (item.detectedKind !== 'approved_html' || item.residualReasons.length || !row.content_hash ||
        !row.storage_key || !item.aliases.length || item.aliases.some((alias) => (
          alias.kind !== 'approved_html' || alias.sha256 !== row.content_hash
        ))) throw new Error(`Attachment retirement item is not authoritative: ${item.attachmentId}`);
    return { aliases: item.aliases.map(({ name, sha256 }) => ({ name, sha256 })),
      attachmentId: item.attachmentId, contentHash: row.content_hash,
      evidence: { references: item.references, row: item.row }, storageKey: row.storage_key };
  }) satisfies LocalRetirementTarget[];
}

function validateFreshPlan(sqlite: InstanceType<typeof BetterSqlite3>, args: ApplyArgs, receipt: PreflightReceipt) {
  const freshPlan = buildCanonicalAttachmentMigrationPlan(sqlite as never, args.assets);
  if (JSON.stringify(freshPlan) !== JSON.stringify(receipt.plan)) {
    throw new Error('Attachment retirement preflight no longer matches database and file identities.');
  }
}

export function runHtmlOrphanRetirement(args: ApplyArgs) {
  const receipt = loadReceipt(args);
  const sqlite = new BetterSqlite3(args.database, { fileMustExist: true });
  let prepared: ReturnType<typeof prepareHtmlOrphanRetirement> | null = null;
  try {
    const beforeVersion = assertLocalRetirementPreconditions(sqlite);
    const targets = targetsFromPlan(receipt.plan);
    if (!targets.length) throw new Error('Attachment retirement preflight has no approved HTML items.');
    const located = locateHtmlOrphanRetirement(args.assets, targets);
    if (fs.existsSync(located.journalPath)) {
      const existing = readHtmlOrphanRetirementJournal(located.journalPath);
      if (existing.database_path === path.resolve(args.database) && existing.assets_root === path.resolve(args.assets) &&
          JSON.stringify(existing.targets) === JSON.stringify(targets) &&
          (existing.stage === 'verified' || existing.stage === 'finalized')) {
        return { beforeVersion, itemCount: targets.length, journalPath: located.journalPath,
          resultStatus: existing.stage, version: 1 };
      }
    }
    validateFreshPlan(sqlite, args, receipt);
    const snapshot = captureRetirementDatabaseSnapshot(sqlite, targets.map((target) => target.attachmentId));
    prepared = prepareHtmlOrphanRetirement(args.database, args.assets, targets, snapshot);
    stageHtmlOrphanFiles(prepared.journalPath);
    applyLocalAttachmentRetirement(sqlite, targets);
    writeRetirementStage(prepared.journalPath, 'database_committed');
    verifyHtmlOrphanFilesStaged(prepared.journalPath);
    if (Number(sqlite.pragma('user_version', { simple: true })) !== beforeVersion) {
      throw new Error('Attachment retirement changed the database version.');
    }
    writeRetirementStage(prepared.journalPath, 'verified');
    return { beforeVersion, itemCount: targets.length, journalPath: prepared.journalPath,
      resultStatus: 'verified' as const, version: 1 };
  } catch (error) {
    if (!prepared) throw error;
    try {
      const journal = readHtmlOrphanRetirementJournal(prepared.journalPath);
      restoreRetirementDatabase(sqlite, journal.database_snapshot as RetirementDatabaseSnapshot,
        journal.targets.map((target) => target.attachmentId));
      restoreHtmlOrphanFiles(prepared.journalPath);
    } catch (restoreError) {
      throw new AggregateError([error, restoreError], 'Attachment retirement and automatic restore both failed.');
    }
    throw error;
  } finally {
    sqlite.close();
  }
}

export function restoreHtmlOrphanRetirement(database: string, journalPath: string) {
  const journal = readHtmlOrphanRetirementJournal(journalPath);
  if (journal.database_path !== path.resolve(database)) throw new Error('Attachment retirement database mismatch.');
  const sqlite = new BetterSqlite3(database, { fileMustExist: true });
  try {
    restoreRetirementDatabase(sqlite, journal.database_snapshot as RetirementDatabaseSnapshot,
      journal.targets.map((target) => target.attachmentId));
    restoreHtmlOrphanFiles(journalPath);
  } finally {
    sqlite.close();
  }
  return { itemCount: journal.targets.length, journalPath, resultStatus: 'restored' as const, version: 1 };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = args.mode === 'apply' ? runHtmlOrphanRetirement(args)
    : args.mode === 'restore' ? restoreHtmlOrphanRetirement(args.database, args.journal)
      : finalizeForDatabase(args.database, args.journal);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function finalizeForDatabase(database: string, journalPath: string) {
  const journal = readHtmlOrphanRetirementJournal(journalPath);
  if (journal.database_path !== path.resolve(database)) throw new Error('Attachment retirement database mismatch.');
  return finalizeHtmlOrphanRetirement(journalPath);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
