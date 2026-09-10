import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  commitDesktopAttachmentRetirement,
  finalizeDesktopAttachmentRetirement,
  prepareDesktopAttachmentRetirement,
  restoreDesktopAttachmentRetirement
} from '../../electron/attachments/attachmentRetirementJournal.js';
import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort.js';
import { ATTACHMENT_SYNC_TOMBSTONE_SCHEMA_STATEMENTS } from '../../lib/core/database/attachmentSyncTombstoneSchemaStatements.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { recordAttachmentRetirementObligation } from '../../lib/core/sync/attachmentRetirementObligation.js';
import { applySyncObjectsWithDbPort } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';

import {
  captureHtmlOrphanRetirementDatabaseSnapshot,
  restoreHtmlOrphanRetirement
} from './htmlOrphanRetirementDatabaseSnapshot.js';

export { restoreHtmlOrphanRetirement } from './htmlOrphanRetirementDatabaseSnapshot.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

interface PreflightItem {
  aliases: Array<{ kind: string; name: string; sha256: string }>;
  attachmentId: string;
  decision: string;
  detectedKind: string;
  references: {
    externalDocuments: unknown[]; nodeAttachments: unknown[]; nodeBodies: unknown[];
    nodeSyncVersions: unknown[]; pdfPageCount: number;
  };
  residualReasons: string[];
  row: {
    attachment_id: string; attachment_mime_type: string | null; blob_mime_type: string | null;
    content_hash: string | null; storage_key: string | null;
  };
}

interface PreflightReceipt {
  input: { assetsDir: string; databasePath: string };
  plan: { items: PreflightItem[]; residualBlockers: unknown[] };
  productionState: { unchanged: boolean };
  version: number;
}

interface ApplyArgs { assets: string; database: string; preflight: string }
type ParsedArgs =
  | { database: string; journal: string; mode: 'finalize' }
  | { database: string; journal: string; mode: 'restore' }
  | (ApplyArgs & { mode: 'apply' });

function parseArgs(argv: string[]): ParsedArgs {
  const mode = argv[0];
  const values = new Map<string, string>();
  for (let index = 1; index < argv.length; index += 2) {
    if (!argv[index] || !argv[index + 1]) throw usage();
    values.set(argv[index] as string, argv[index + 1] as string);
  }
  if (mode === 'finalize' || mode === 'restore') {
    const journal = values.get('--journal');
    const database = values.get('--database');
    if (!journal || !database || !path.isAbsolute(journal) || !path.isAbsolute(database)) throw usage();
    return { database, journal, mode };
  }
  if (mode !== 'apply') throw usage();
  const result = { assets: values.get('--assets') ?? '', database: values.get('--database') ?? '',
    preflight: values.get('--preflight') ?? '' };
  if (!Object.values(result).every(path.isAbsolute)) throw usage();
  return { ...result, mode } as const;
}

function usage() {
  return new Error(
    'usage: apply --database <path> --assets <path> --preflight <path> | ' +
    'finalize --database <path> --journal <path> | restore --database <path> --journal <path>'
  );
}

function loadReceipt(args: ApplyArgs) {
  const receipt = JSON.parse(fs.readFileSync(args.preflight, 'utf8')) as PreflightReceipt;
  if (receipt.version !== 2 || !receipt.productionState?.unchanged || receipt.plan.residualBlockers.length ||
      path.resolve(receipt.input.databasePath) !== path.resolve(args.database) ||
      path.resolve(receipt.input.assetsDir) !== path.resolve(args.assets)) {
    throw new Error('Attachment retirement preflight is not an unchanged, blocker-free match.');
  }
  return receipt;
}

function htmlItems(receipt: PreflightReceipt) {
  return receipt.plan.items.filter((item) => item.decision === 'html_orphan_delete').map((item) => {
    const row = item.row;
    const referenceCount = item.references.externalDocuments.length + item.references.nodeAttachments.length +
      item.references.nodeBodies.length + item.references.nodeSyncVersions.length + item.references.pdfPageCount;
    if (item.detectedKind !== 'approved_html' || item.residualReasons.length || referenceCount ||
        row.attachment_id !== item.attachmentId || !row.content_hash || !row.storage_key || !row.blob_mime_type ||
        item.aliases.some((alias) => alias.kind !== 'approved_html' || alias.sha256 !== row.content_hash)) {
      throw new Error(`Attachment retirement item is no longer authoritative: ${item.attachmentId}`);
    }
    return item as PreflightItem & { row: PreflightItem['row'] & {
      blob_mime_type: string; content_hash: string; storage_key: string;
    } };
  });
}

function toRecords(items: ReturnType<typeof htmlItems>, deletedAt: string): NativeSyncObjectRecord[] {
  return items.map((item) => {
    const payload = { attachment_id: item.attachmentId, content_hash: item.row.content_hash,
      mime_type: item.row.blob_mime_type, storage_key: item.row.storage_key };
    return { content_hash: computeSyncContentHash('attachment', { ...payload, deleted_at: deletedAt }),
      deleted_at: deletedAt, object_id: item.attachmentId, object_type: 'attachment',
      payload_json: JSON.stringify(payload), updated_at: deletedAt };
  });
}

export async function runHtmlOrphanRetirement(args: ApplyArgs) {
  const items = htmlItems(loadReceipt(args));
  if (!items.length) throw new Error('Attachment retirement preflight has no approved HTML items.');
  const deletedAt = new Date().toISOString();
  const records = toRecords(items, deletedAt);
  const aliases = new Map(items.map((item) => [item.attachmentId, item.aliases.map((alias) => alias.name)]));
  const evidence = new Map(items.map((item) => [item.attachmentId, {
    aliases: item.aliases,
    decision: item.decision,
    detected_kind: item.detectedKind,
    references: item.references,
    row_snapshot: item.row
  }]));
  const sqlite = new BetterSqlite3(args.database, { fileMustExist: true });
  const databaseSnapshot = captureHtmlOrphanRetirementDatabaseSnapshot(
    sqlite, items.map((item) => item.attachmentId), records
  );
  const prepared = prepareDesktopAttachmentRetirement(
    records, args.assets, aliases, args.database, evidence, databaseSnapshot
  );
  if (!prepared) { sqlite.close(); throw new Error('Attachment retirement journal was not created.'); }
  const driver = createBetterSqlite3Driver(sqlite);
  const port = createBetterSqliteDbPort(sqlite, { name: 'html-orphan-retirement' });
  try {
    sqlite.pragma('foreign_keys = ON');
    const beforeVersion = Number(sqlite.pragma('user_version', { simple: true }));
    if (beforeVersion !== 84 && beforeVersion !== 85) throw new Error(`Unexpected database version: ${beforeVersion}`);
    await port.transaction(async (tx) => {
      for (const statement of ATTACHMENT_SYNC_TOMBSTONE_SCHEMA_STATEMENTS) await tx.run(statement);
      await applySyncObjectsWithDbPort(tx, records);
      const obligation = {
        items: prepared.tombstones,
        journalToken: prepared.journalToken,
        libraryScope: prepared.libraryScope
      };
      await recordAttachmentRetirementObligation(tx, obligation, 'database_committed');
      commitDesktopAttachmentRetirement(prepared, driver);
      await recordAttachmentRetirementObligation(tx, obligation, 'verified');
      await tx.run('PRAGMA user_version = 85');
    });
    return { beforeVersion, deletedAt, itemCount: items.length, journalPath: prepared.journalPath,
      resultStatus: 'verified', version: 1 };
  } catch (error) {
    restoreDesktopAttachmentRetirement(prepared);
    throw error;
  } finally {
    sqlite.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === 'finalize') {
    const sqlite = new BetterSqlite3(args.database, { fileMustExist: true });
    try {
      const port = createBetterSqliteDbPort(sqlite, { name: 'html-orphan-retirement-finalize' });
      await port.transaction(async (tx) => {
        const obligation = finalizeDesktopAttachmentRetirement(args.journal);
        await recordAttachmentRetirementObligation(tx, obligation, 'finalized');
      });
    } finally {
      sqlite.close();
    }
    process.stdout.write(`${JSON.stringify({ journalPath: args.journal, resultStatus: 'finalized' }, null, 2)}\n`);
    return;
  }
  if (args.mode === 'restore') {
    process.stdout.write(`${JSON.stringify(await restoreHtmlOrphanRetirement(args.database, args.journal), null, 2)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(await runHtmlOrphanRetirement(args), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
