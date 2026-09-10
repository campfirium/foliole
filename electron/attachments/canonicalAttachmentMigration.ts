import fs from 'node:fs';
import path from 'node:path';

import { resolveNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import { applyParentContentChange } from '../../lib/core/database/parentContentMutation.js';
import { rewriteCanonicalAssetMarkdownTargets } from '../../lib/platform/canonicalAssetMarkdownMigration.js';
import { refreshAttachmentSyncState } from '../database/attachmentBlobs.js';
import type { SqliteDatabase } from '../database/connection.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadOrCreateDesktopHostName } from '../database/hostProfile.js';
import { flushNodeSyncVersionWithDriver } from '../database/nodeSyncVersionFromDriver.js';

import type { CanonicalAttachmentMigrationPlan } from './canonicalAttachmentMigrationPlan.js';
import { buildCanonicalAttachmentMigrationPlan } from './canonicalAttachmentMigrationPlan.js';
import { hashFile, type AttachmentFileEvidence } from './canonicalAttachmentPreflightFiles.js';

export type CanonicalAttachmentJournalStage =
  | 'planned' | 'targets_prepared' | 'database_committed' | 'verified' | 'finalized';

interface CanonicalAttachmentJournal {
  createdTargets: string[];
  plan: CanonicalAttachmentMigrationPlan;
  stagedAliases: Array<{ originalPath: string; sha256: string; stagedPath: string }>;
  stage: CanonicalAttachmentJournalStage;
  version: 1;
}

function assetPath(assetsDir: string, name: string) {
  if (path.basename(name) !== name) throw new Error('canonical_attachment_path_invalid');
  return path.join(assetsDir, name);
}

function assertFileIdentity(filePath: string, evidence: AttachmentFileEvidence) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== evidence.sizeBytes || hashFile(filePath) !== evidence.sha256) {
    throw new Error(`canonical_attachment_source_identity_changed:${evidence.name}`);
  }
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
  for (const item of journal.plan.journalPlan.items) {
    if (!item.sourceIdentity || !item.storageKeyAfter) continue;
    const sourcePath = assetPath(journal.plan.assetsRoot, item.sourceIdentity.name);
    const canonicalPath = assetPath(journal.plan.assetsRoot, item.storageKeyAfter);
    if (sourcePath === canonicalPath || fs.existsSync(canonicalPath)) continue;
    assertFileIdentity(sourcePath, item.sourceIdentity);
    const temporary = `${canonicalPath}.t180-${process.pid}`;
    fs.copyFileSync(sourcePath, temporary, fs.constants.COPYFILE_EXCL);
    const descriptor = fs.openSync(temporary, 'r');
    try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
    fs.renameSync(temporary, canonicalPath);
    journal.createdTargets.push(canonicalPath);
    writeJournal(journalPath, journal);
  }
  journal.stage = 'targets_prepared';
  writeJournal(journalPath, journal);
}

function commitDatabase(sqlite: SqliteDatabase, journalPath: string, journal: CanonicalAttachmentJournal) {
  sqlite.transaction(() => {
    const update = sqlite.prepare(
      `UPDATE attachment_blobs SET storage_key = ?, mime_type = COALESCE(?, mime_type), availability = ?
       WHERE attachment_id = ?`
    );
    const updateAttachmentMime = sqlite.prepare('UPDATE attachments SET mime_type = ? WHERE id = ?');
    for (const item of journal.plan.journalPlan.items) {
      if (item.decision === 'html_orphan_delete') {
        deleteHtmlOrphan(sqlite, item.attachmentId);
        continue;
      }
      if (!item.storageKeyAfter) continue;
      const repairedMime = item.decision === 'image_mime_repair' ? item.sourceIdentity?.kind ?? null : null;
      update.run(item.storageKeyAfter, repairedMime,
        item.decision === 'known_missing' ? 'remote_known' : 'local', item.attachmentId);
      if (repairedMime) updateAttachmentMime.run(repairedMime, item.attachmentId);
      refreshAttachmentSyncState(openDatabaseConnection().driver, item.attachmentId, new Date().toISOString());
    }
    rewriteCurrentNodeBodies(journal.plan);
  })();
  journal.stage = 'database_committed';
  writeJournal(journalPath, journal);
}

function deleteHtmlOrphan(sqlite: SqliteDatabase, attachmentId: string) {
  sqlite.prepare('DELETE FROM node_attachments WHERE attachment_id = ?').run(attachmentId);
  sqlite.prepare('DELETE FROM pdf_page_text WHERE attachment_id = ?').run(attachmentId);
  sqlite.prepare("DELETE FROM sync_object_state WHERE object_type = 'attachment' AND object_id = ?").run(attachmentId);
  sqlite.prepare('DELETE FROM attachment_blobs WHERE attachment_id = ?').run(attachmentId);
  sqlite.prepare('DELETE FROM attachments WHERE id = ?').run(attachmentId);
}

function legacyTargetMap(plan: CanonicalAttachmentMigrationPlan) {
  const map = new Map<string, string>();
  for (const item of plan.items) {
    if (!item.canonicalStorageKey) continue;
    const targets = [item.attachmentId, item.row.content_hash, item.row.storage_key,
      ...item.aliases.map((alias) => alias.name)];
    for (const target of targets) {
      if (target) map.set(target, item.canonicalStorageKey);
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
  for (const item of journal.plan.journalPlan.items) {
    for (const alias of item.stagedAliases) stageAlias(alias);
  }
  function stageAlias(alias: AttachmentFileEvidence) {
    const originalPath = assetPath(assetsDir, alias.name);
    const stagedPath = assetPath(stagingRoot, alias.name);
    if (journal.stagedAliases.some((entry) => entry.originalPath === originalPath)) return;
    fs.mkdirSync(stagingRoot, { recursive: true });
    if (fs.existsSync(stagedPath) && !fs.existsSync(originalPath)) assertFileIdentity(stagedPath, alias);
    else {
      if (fs.existsSync(stagedPath)) throw new Error(`canonical_attachment_staging_conflict:${alias.name}`);
      assertFileIdentity(originalPath, alias);
      fs.renameSync(originalPath, stagedPath);
    }
    journal.stagedAliases.push({ originalPath, sha256: alias.sha256, stagedPath });
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
  const conflicts = journal.plan.residualBlockers.filter((item) =>
    item.reasons.includes('canonical_target_conflict')).map((item) => item.attachmentId);
  if (conflicts.length) throw new Error(`canonical_attachment_target_conflict:${conflicts.join(',')}`);
  writeJournal(args.journalPath, journal);
  if (journal.stage === 'planned') prepareTargets(args.journalPath, journal);
  if (journal.stage === 'targets_prepared') commitDatabase(args.sqlite, args.journalPath, journal);
  if (journal.stage === 'database_committed') stageAliases(args.assetsDir, args.journalPath, journal);
  return journal.plan;
}

export function finalizeCanonicalAttachmentMigration(journalPath: string) {
  const journal = readJournal(journalPath);
  if (!journal || journal.stage !== 'verified') throw new Error('canonical_attachment_migration_not_verified');
  for (const alias of journal.stagedAliases) {
    if (fs.existsSync(alias.stagedPath) && hashFile(alias.stagedPath) !== alias.sha256) {
      throw new Error('canonical_attachment_staged_identity_changed');
    }
    fs.rmSync(alias.stagedPath, { force: true });
  }
  journal.stage = 'finalized';
  writeJournal(journalPath, journal);
}
