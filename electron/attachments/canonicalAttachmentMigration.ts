import fs from 'node:fs';
import path from 'node:path';

import type { SqliteDatabase } from '../database/connection.js';
import { rewriteCanonicalAssetMarkdownTargets } from '../../lib/platform/canonicalAssetMarkdownMigration.js';
import { applyParentContentChange } from '../../lib/core/database/parentContentMutation.js';
import { resolveNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import { flushNodeSyncVersionWithDriver } from '../database/nodeSyncVersionFromDriver.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadOrCreateDesktopHostName } from '../database/hostProfile.js';
import { refreshAttachmentSyncState } from '../database/attachmentBlobs.js';
import type { CanonicalAttachmentMigrationPlan } from './canonicalAttachmentMigrationPlan.js';
import { buildCanonicalAttachmentMigrationPlan } from './canonicalAttachmentMigrationPlan.js';

export type CanonicalAttachmentJournalStage =
  | 'planned' | 'targets_prepared' | 'database_committed' | 'verified' | 'finalized';

interface CanonicalAttachmentJournal {
  createdTargets: string[];
  plan: CanonicalAttachmentMigrationPlan;
  stagedAliases: Array<{ originalPath: string; stagedPath: string }>;
  stage: CanonicalAttachmentJournalStage;
  version: 1;
}

function writeJournal(journalPath: string, journal: CanonicalAttachmentJournal) {
  fs.mkdirSync(path.dirname(journalPath), { recursive: true });
  const temporary = `${journalPath}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(journal, null, 2));
  const descriptor = fs.openSync(temporary, 'r');
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
  fs.renameSync(temporary, journalPath);
}

function readJournal(journalPath: string) {
  if (!fs.existsSync(journalPath)) return null;
  return JSON.parse(fs.readFileSync(journalPath, 'utf8')) as CanonicalAttachmentJournal;
}

function prepareTargets(journalPath: string, journal: CanonicalAttachmentJournal) {
  for (const item of journal.plan.items) {
    if (item.status !== 'ready' || !item.sourcePath || !item.canonicalPath ||
        item.sourcePath === item.canonicalPath || fs.existsSync(item.canonicalPath)) continue;
    const temporary = `${item.canonicalPath}.t180-${process.pid}`;
    fs.copyFileSync(item.sourcePath, temporary, fs.constants.COPYFILE_EXCL);
    const descriptor = fs.openSync(temporary, 'r');
    try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
    fs.renameSync(temporary, item.canonicalPath);
    journal.createdTargets.push(item.canonicalPath);
    writeJournal(journalPath, journal);
  }
  journal.stage = 'targets_prepared';
  writeJournal(journalPath, journal);
}

function commitDatabase(sqlite: SqliteDatabase, journalPath: string, journal: CanonicalAttachmentJournal) {
  sqlite.transaction(() => {
    const update = sqlite.prepare(
      `UPDATE attachment_blobs SET storage_key = ?, availability = ? WHERE attachment_id = ?`
    );
    for (const item of journal.plan.items) {
      if (!item.storageKey) continue;
      update.run(item.storageKey, item.status === 'missing' ? 'remote_known' : item.availability, item.attachmentId);
      refreshAttachmentSyncState(openDatabaseConnection().driver, item.attachmentId, new Date().toISOString());
    }
    rewriteCurrentNodeBodies(journal.plan);
  })();
  journal.stage = 'database_committed';
  writeJournal(journalPath, journal);
}

function legacyTargetMap(plan: CanonicalAttachmentMigrationPlan) {
  const map = new Map<string, string>();
  for (const item of plan.items) {
    if (!item.storageKey) continue;
    for (const target of [item.attachmentId, item.contentHash, item.sourcePath && path.basename(item.sourcePath)]) {
      if (target) map.set(target, item.storageKey);
    }
  }
  return map;
}

function rewriteCurrentNodeBodies(plan: CanonicalAttachmentMigrationPlan) {
  const connection = openDatabaseConnection();
  const rows = connection.driver.queryAll<NodeBodyRow & { id: string }>(
    `SELECT n.id, n.content, n.body_blob_hash, cbd.data AS body_blob_data FROM nodes n
     LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash WHERE n.deleted_at IS NULL`
  );
  const mapping = legacyTargetMap(plan);
  const now = new Date().toISOString();
  const hostName = loadOrCreateDesktopHostName(now);
  for (const row of rows) {
    const resolved = resolveNodeBody(row);
    if (resolved.status !== 'resolved') continue;
    const nextContent = rewriteCanonicalAssetMarkdownTargets(resolved.content, mapping);
    const changed = applyParentContentChange({ driver: connection.driver, nextContent,
      nodeId: row.id, previousContent: resolved.content, updatedAt: now });
    if (changed.written) flushNodeSyncVersionWithDriver(connection.driver, row.id, hostName, now);
  }
}

function stageAliases(assetsDir: string, journalPath: string, journal: CanonicalAttachmentJournal) {
  const stagingRoot = path.join(assetsDir, '.t180-retired');
  for (const item of journal.plan.items) {
    if (!item.sourcePath || !item.canonicalPath || item.sourcePath === item.canonicalPath ||
        !fs.existsSync(item.sourcePath) || !fs.existsSync(item.canonicalPath)) continue;
    const stagedPath = path.join(stagingRoot, path.basename(item.sourcePath));
    fs.mkdirSync(stagingRoot, { recursive: true });
    if (!fs.existsSync(stagedPath)) fs.renameSync(item.sourcePath, stagedPath);
    journal.stagedAliases.push({ originalPath: item.sourcePath, stagedPath });
    writeJournal(journalPath, journal);
  }
  journal.stage = 'verified';
  writeJournal(journalPath, journal);
}

export function runCanonicalAttachmentMigration(args: {
  assetsDir: string;
  dryRun?: boolean;
  journalPath: string;
  sqlite: SqliteDatabase;
}) {
  const existing = readJournal(args.journalPath);
  if (existing?.stage === 'finalized' || args.dryRun) {
    return existing?.plan ?? buildCanonicalAttachmentMigrationPlan(args.sqlite, args.assetsDir);
  }
  const journal = existing ?? {
    createdTargets: [], plan: buildCanonicalAttachmentMigrationPlan(args.sqlite, args.assetsDir),
    stagedAliases: [], stage: 'planned' as const, version: 1 as const
  };
  if (journal.plan.conflicts.length) throw new Error(`canonical_attachment_target_conflict:${journal.plan.conflicts.join(',')}`);
  writeJournal(args.journalPath, journal);
  if (journal.stage === 'planned') prepareTargets(args.journalPath, journal);
  if (journal.stage === 'targets_prepared') commitDatabase(args.sqlite, args.journalPath, journal);
  if (journal.stage === 'database_committed') stageAliases(args.assetsDir, args.journalPath, journal);
  return journal.plan;
}

export function finalizeCanonicalAttachmentMigration(journalPath: string) {
  const journal = readJournal(journalPath);
  if (!journal || journal.stage !== 'verified') throw new Error('canonical_attachment_migration_not_verified');
  for (const alias of journal.stagedAliases) fs.rmSync(alias.stagedPath, { force: true });
  journal.stage = 'finalized';
  writeJournal(journalPath, journal);
}
