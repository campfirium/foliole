import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { hashFile } from './canonicalAttachmentPreflightFiles.js';

export type RetirementStage =
  | 'planned' | 'targets_prepared' | 'database_committed' | 'verified' | 'finalized' | 'restored';

export interface LocalRetirementTarget {
  aliases: Array<{ name: string; sha256: string }>;
  attachmentId: string;
  contentHash: string;
  evidence: unknown;
  storageKey: string;
}

interface JournalFile {
  attachment_id: string;
  sha256: string;
  source_path: string;
  staged_path: string;
}

export interface HtmlOrphanRetirementJournal {
  assets_root: string;
  created_at: string;
  database_path: string;
  database_snapshot: unknown;
  files: JournalFile[];
  stage: RetirementStage;
  stage_history: RetirementStage[];
  targets: LocalRetirementTarget[];
  version: 1;
}

export interface PreparedHtmlOrphanRetirement {
  journalPath: string;
  journalToken: string;
}

export function locateHtmlOrphanRetirement(assetsRoot: string, targets: LocalRetirementTarget[]) {
  const identity = targets.map(({ attachmentId, contentHash, storageKey }) => (
    { attachmentId, contentHash, storageKey }
  ));
  const journalToken = createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 24);
  const journalRoot = path.join(path.dirname(assetsRoot), 'AttachmentRetirement');
  return { journalPath: path.join(journalRoot, `${journalToken}.json`), journalRoot, journalToken,
    stagedRoot: path.join(journalRoot, journalToken) };
}

function safeChild(root: string, name: string) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, name);
  if (path.dirname(resolved) !== resolvedRoot) throw new Error('Attachment retirement path escapes its root.');
  return resolved;
}

export function readHtmlOrphanRetirementJournal(journalPath: string) {
  return JSON.parse(fs.readFileSync(journalPath, 'utf8')) as HtmlOrphanRetirementJournal;
}

function writeJournal(journalPath: string, journal: HtmlOrphanRetirementJournal) {
  const temporaryPath = `${journalPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(journal, null, 2)}\n`, 'utf8');
  const descriptor = fs.openSync(temporaryPath, 'r');
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
  fs.renameSync(temporaryPath, journalPath);
}

export function writeRetirementStage(journalPath: string, stage: RetirementStage) {
  const journal = readHtmlOrphanRetirementJournal(journalPath);
  const history = journal.stage_history.at(-1) === stage ? journal.stage_history : [...journal.stage_history, stage];
  writeJournal(journalPath, { ...journal, stage, stage_history: history });
}

export function prepareHtmlOrphanRetirement(
  databasePath: string,
  assetsRoot: string,
  targets: LocalRetirementTarget[],
  databaseSnapshot: unknown
): PreparedHtmlOrphanRetirement {
  const { journalPath, journalToken, stagedRoot } = locateHtmlOrphanRetirement(assetsRoot, targets);
  if (fs.existsSync(journalPath)) {
    const existing = readHtmlOrphanRetirementJournal(journalPath);
    if (existing.database_path !== path.resolve(databasePath) || existing.assets_root !== path.resolve(assetsRoot) ||
        JSON.stringify(existing.targets) !== JSON.stringify(targets)) {
      throw new Error('Attachment retirement journal identity mismatch.');
    }
    return { journalPath, journalToken };
  }
  fs.mkdirSync(stagedRoot, { recursive: true });
  const files = targets.flatMap((target) => [...new Set(target.aliases.map((alias) => alias.name))].map((name) => {
    const alias = target.aliases.find((candidate) => candidate.name === name);
    if (!alias || alias.sha256 !== target.contentHash) {
      throw new Error(`Attachment retirement alias identity mismatch: ${target.attachmentId}`);
    }
    const sourcePath = safeChild(assetsRoot, name);
    if (!fs.existsSync(sourcePath) || !fs.lstatSync(sourcePath).isFile() || fs.lstatSync(sourcePath).isSymbolicLink() ||
        hashFile(sourcePath) !== target.contentHash) {
      throw new Error(`Attachment retirement source identity mismatch: ${target.attachmentId}`);
    }
    return { attachment_id: target.attachmentId, sha256: target.contentHash,
      source_path: sourcePath, staged_path: safeChild(stagedRoot, name) };
  }));
  if (!files.length) throw new Error('Attachment retirement has no exact local files.');
  writeJournal(journalPath, { assets_root: path.resolve(assetsRoot), created_at: new Date().toISOString(),
    database_path: path.resolve(databasePath), database_snapshot: databaseSnapshot, files,
    stage: 'planned', stage_history: ['planned'], targets, version: 1 });
  return { journalPath, journalToken };
}

export function stageHtmlOrphanFiles(journalPath: string) {
  const journal = readHtmlOrphanRetirementJournal(journalPath);
  if (!['planned', 'restored'].includes(journal.stage)) {
    throw new Error(`Attachment retirement requires recovery before apply: ${journal.stage}`);
  }
  for (const file of journal.files) {
    if (fs.existsSync(file.staged_path) || !fs.existsSync(file.source_path) ||
        hashFile(file.source_path) !== file.sha256) {
      throw new Error(`Attachment retirement file identity drifted: ${file.attachment_id}`);
    }
  }
  for (const file of journal.files) fs.renameSync(file.source_path, file.staged_path);
  writeRetirementStage(journalPath, 'targets_prepared');
}

export function restoreHtmlOrphanFiles(journalPath: string) {
  const journal = readHtmlOrphanRetirementJournal(journalPath);
  for (const file of journal.files) {
    if (!fs.existsSync(file.staged_path)) continue;
    if (fs.existsSync(file.source_path) || hashFile(file.staged_path) !== file.sha256) {
      throw new Error(`Attachment retirement file cannot be restored: ${file.attachment_id}`);
    }
    fs.renameSync(file.staged_path, file.source_path);
  }
  writeRetirementStage(journalPath, 'restored');
}

export function verifyHtmlOrphanFilesStaged(journalPath: string) {
  const journal = readHtmlOrphanRetirementJournal(journalPath);
  for (const file of journal.files) {
    if (fs.existsSync(file.source_path) || !fs.existsSync(file.staged_path) ||
        hashFile(file.staged_path) !== file.sha256) {
      throw new Error(`Attachment retirement file verification failed: ${file.attachment_id}`);
    }
  }
}

export function finalizeHtmlOrphanRetirement(journalPath: string) {
  const journal = readHtmlOrphanRetirementJournal(journalPath);
  if (!['verified', 'finalized'].includes(journal.stage)) {
    throw new Error(`Attachment retirement journal is not verified: ${journal.stage}`);
  }
  for (const file of journal.files) {
    if (fs.existsSync(file.staged_path)) {
      if (hashFile(file.staged_path) !== file.sha256) throw new Error('Staged attachment identity changed.');
      fs.rmSync(file.staged_path);
    }
  }
  writeRetirementStage(journalPath, 'finalized');
  return { itemCount: journal.targets.length, journalPath, resultStatus: 'finalized' as const, version: 1 };
}
