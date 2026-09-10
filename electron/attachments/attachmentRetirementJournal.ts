import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import {
  parseAttachmentSyncTombstone,
  type AttachmentSyncTombstone
} from '../../lib/platform/attachmentSyncTombstone.js';
import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';

import { hashFile } from './canonicalAttachmentPreflightFiles.js';

type JournalStage = 'planned' | 'targets_prepared' | 'database_committed' | 'verified' | 'finalized' | 'restored';

interface JournalItem extends AttachmentSyncTombstone {
  evidence?: unknown;
  source_path: string;
  staged_path: string;
  source_present: boolean;
}

interface AttachmentRetirementJournal {
  created_at: string;
  items: JournalItem[];
  library_scope: string;
  stage: JournalStage;
  stage_history: JournalStage[];
  version: 1;
}

export interface PreparedAttachmentRetirement {
  journalToken: string;
  journalPath: string;
  libraryScope: string;
  tombstones: AttachmentSyncTombstone[];
}

export function prepareDesktopAttachmentRetirement(
  records: NativeSyncObjectRecord[],
  assetsDir: string,
  aliasesByAttachmentId: ReadonlyMap<string, readonly string[]> = new Map(),
  libraryScope = path.resolve(assetsDir),
  evidenceByAttachmentId: ReadonlyMap<string, unknown> = new Map()
): PreparedAttachmentRetirement | null {
  const tombstones = records.flatMap((record) => toTombstone(record));
  if (!tombstones.length) return null;
  const root = path.join(path.dirname(assetsDir), 'AttachmentRetirement');
  const id = createHash('sha256').update(JSON.stringify(tombstones)).digest('hex').slice(0, 24);
  const journalPath = path.join(root, `${id}.json`);
  if (fs.existsSync(journalPath)) return { journalPath, journalToken: id, libraryScope, tombstones };
  fs.mkdirSync(path.join(root, id), { recursive: true });
  const items = tombstones.flatMap((tombstone) => {
    const names = aliasesByAttachmentId.get(tombstone.attachment_id) ?? [tombstone.storage_key];
    return [...new Set(names)].map((name) => journalItem(
      tombstone, name, assetsDir, path.join(root, id), evidenceByAttachmentId.get(tombstone.attachment_id)
    ));
  });
  writeJournal(journalPath, {
    created_at: new Date().toISOString(), items, library_scope: libraryScope,
    stage: 'planned', stage_history: ['planned'], version: 1
  });
  writeStage(journalPath, 'targets_prepared');
  return { journalPath, journalToken: id, libraryScope, tombstones };
}

export function commitDesktopAttachmentRetirement(
  prepared: PreparedAttachmentRetirement | null,
  driver: DatabaseDriver
) {
  if (!prepared) return;
  const journal = readJournal(prepared.journalPath);
  if (journal.stage === 'finalized' || journal.stage === 'verified') return;
  writeStage(prepared.journalPath, 'database_committed');
  for (const item of journal.items) {
    const committed = driver.queryOne<{ present: number }>(
      `SELECT 1 AS present FROM attachment_sync_tombstones
       WHERE attachment_id = ? AND content_hash = ? AND storage_key = ? AND mime_type = ?`,
      [item.attachment_id, item.content_hash, item.storage_key, item.mime_type]
    );
    if (!committed) throw new Error(`Attachment retirement database identity is missing: ${item.attachment_id}`);
    if (!item.source_present || fs.existsSync(item.staged_path)) continue;
    if (!fs.existsSync(item.source_path) || hashFile(item.source_path) !== item.content_hash) {
      throw new Error(`Attachment retirement source identity changed: ${item.attachment_id}`);
    }
    fs.renameSync(item.source_path, item.staged_path);
  }
  for (const item of journal.items) {
    if (item.source_present && !fs.existsSync(item.source_path) &&
        (!fs.existsSync(item.staged_path) || hashFile(item.staged_path) !== item.content_hash)) {
      throw new Error(`Attachment retirement staging verification failed: ${item.attachment_id}`);
    }
  }
  writeStage(prepared.journalPath, 'verified');
}

export function restoreDesktopAttachmentRetirement(
  prepared: Pick<PreparedAttachmentRetirement, 'journalPath'> | null
) {
  if (!prepared || !fs.existsSync(prepared.journalPath)) return;
  const journal = readJournal(prepared.journalPath);
  for (const item of journal.items) {
    if (!fs.existsSync(item.staged_path)) continue;
    if (fs.existsSync(item.source_path)) throw new Error(`Attachment retirement restore target exists: ${item.source_path}`);
    fs.renameSync(item.staged_path, item.source_path);
  }
  writeStage(prepared.journalPath, 'restored');
}

export function finalizeDesktopAttachmentRetirement(journalPath: string) {
  const journal = readJournal(journalPath);
  if (journal.stage !== 'verified' && journal.stage !== 'finalized') {
    throw new Error(`Attachment retirement journal is not verified: ${journal.stage}`);
  }
  for (const item of journal.items) {
    if (fs.existsSync(item.staged_path)) fs.rmSync(item.staged_path);
  }
  writeStage(journalPath, 'finalized');
  return {
    items: journal.items.map(({ attachment_id, content_hash, mime_type, storage_key }) => (
      { attachment_id, content_hash, mime_type, storage_key }
    )),
    journalToken: path.basename(journalPath, '.json'),
    libraryScope: journal.library_scope
  };
}

function toTombstone(record: NativeSyncObjectRecord) {
  if (record.object_type !== 'attachment' || !record.deleted_at) return [];
  const tombstone = parseAttachmentSyncTombstone(JSON.parse(record.payload_json ?? 'null'));
  if (tombstone.attachment_id !== record.object_id) throw new Error('Attachment tombstone identity mismatch.');
  return [tombstone];
}

function journalItem(
  tombstone: AttachmentSyncTombstone,
  fileName: string,
  assetsDir: string,
  stagedRoot: string,
  evidence: unknown
): JournalItem {
  const sourcePath = safeChild(assetsDir, fileName);
  const stagedPath = safeChild(stagedRoot, fileName);
  const sourcePresent = fs.existsSync(sourcePath);
  if (sourcePresent && hashFile(sourcePath) !== tombstone.content_hash) {
    throw new Error(`Attachment retirement source hash mismatch: ${tombstone.attachment_id}`);
  }
  return {
    ...tombstone,
    ...(evidence === undefined ? {} : { evidence }),
    source_path: sourcePath,
    staged_path: stagedPath,
    source_present: sourcePresent
  };
}

function safeChild(root: string, name: string) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, name);
  if (path.dirname(resolved) !== resolvedRoot) throw new Error('Attachment retirement path escapes its root.');
  return resolved;
}

function readJournal(journalPath: string) {
  return JSON.parse(fs.readFileSync(journalPath, 'utf8')) as AttachmentRetirementJournal;
}

function writeJournal(journalPath: string, journal: AttachmentRetirementJournal) {
  const temp = `${journalPath}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(journal, null, 2)}\n`, 'utf8');
  const descriptor = fs.openSync(temp, 'r');
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
  fs.renameSync(temp, journalPath);
}

function writeStage(journalPath: string, stage: JournalStage) {
  const journal = readJournal(journalPath);
  const history = journal.stage_history ?? [journal.stage];
  writeJournal(journalPath, { ...journal, stage, stage_history: history.at(-1) === stage ? history : [...history, stage] });
}
