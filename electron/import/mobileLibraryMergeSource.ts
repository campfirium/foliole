import { copyFile, mkdir, mkdtemp, open, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { COMPANION_FOLDER_BACKUP_FILES } from '../../lib/platform/companionFolderBackupContract.js';
import { readEpubArchiveIndex, type EpubZipEntry } from '../ipc/epubArchive.js';
import { extractEpubEntry } from '../ipc/epubArchiveExtraction.js';

const DATABASE = COMPANION_FOLDER_BACKUP_FILES.databaseFileName;
const SIDECARS = [`${DATABASE}-journal`, `${DATABASE}-wal`];
const ATTACHMENT_FOLDER = 'Attachments';

/** A phone backup laid out on disk for merging: a private copy of its database and the folder holding its attachments. */
export interface StagedMobileLibrarySource {
  databasePath: string;
  attachmentsDirectory: string | null;
  dispose(): Promise<void>;
}

type ArchiveFile = { kind: 'database' | 'attachment'; name: string; entry: EpubZipEntry };

const invalid = () => new Error('library_merge_archive_invalid');

/**
 * Maps a zip's entries onto the phone folder backup layout, the same way the phones read it: the files sit at the
 * root or inside one enclosing folder, every backup file shares that one place, and unsafe names are refused.
 */
export function classifyMobileBackupArchive(entries: ReadonlyMap<string, EpubZipEntry>): ArchiveFile[] {
  let prefix: string | null = null;
  const claim = (location: string) => {
    if (prefix === null) prefix = location;
    else if (prefix !== location) throw invalid();
  };
  const files: ArchiveFile[] = [];
  for (const [raw, entry] of entries) {
    const name = raw.replace(/\\/g, '/');
    if (name.startsWith('/') || /^[A-Za-z]:\//.test(name)) throw invalid();
    const parts = name.split('/');
    if (parts.some(part => !part || part === '.' || part === '..')) throw invalid();
    const last = parts[parts.length - 1]!;
    if (parts[0] === '__MACOSX' || last.startsWith('._') || last.startsWith('.foliole-')) continue;
    if (parts.length <= 2 && (last === DATABASE || SIDECARS.includes(last))) {
      claim(parts.length === 2 ? parts[0]! : '');
      files.push({ kind: 'database', name: last, entry });
    } else if (parts.length >= 2 && parts.length <= 3 && parts[parts.length - 2] === ATTACHMENT_FOLDER) {
      claim(parts.length === 3 ? parts[0]! : '');
      files.push({ kind: 'attachment', name: last, entry });
    }
  }
  if (!files.some(file => file.kind === 'database' && file.name === DATABASE)) throw invalid();
  return files;
}

export async function isZipFile(filePath: string) {
  const file = await open(filePath, 'r');
  try {
    const head = Buffer.alloc(4);
    const { bytesRead } = await file.read(head, 0, 4, 0);
    return bytesRead === 4 && head.readUInt32LE(0) === 0x04034b50;
  } finally { await file.close(); }
}

async function exists(filePath: string) {
  return stat(filePath).then(() => true, () => false);
}

async function stageArchive(sourcePath: string, root: string) {
  let entries: Map<string, EpubZipEntry>;
  try { entries = await readEpubArchiveIndex(sourcePath); } catch { throw invalid(); }
  const files = classifyMobileBackupArchive(entries);
  const attachments = path.join(root, ATTACHMENT_FOLDER);
  await mkdir(attachments);
  for (const file of files) {
    const target = path.join(file.kind === 'database' ? root : attachments, file.name);
    try { await extractEpubEntry(sourcePath, file.entry, target); } catch { throw invalid(); }
  }
  return attachments;
}

/** Copies the database with any sidecars so SQLite never opens or writes next to the user's backup. */
async function stageFolder(folder: string, root: string) {
  if (!await exists(path.join(folder, DATABASE))) throw new Error('library_merge_source_not_library');
  for (const name of [DATABASE, ...SIDECARS]) {
    if (await exists(path.join(folder, name))) await copyFile(path.join(folder, name), path.join(root, name));
  }
  const attachments = path.join(folder, ATTACHMENT_FOLDER);
  return await exists(attachments) ? attachments : null;
}

/**
 * Lays out a phone backup chosen for merging: a zip is unpacked into a private folder, and a backup folder (or the
 * `Foliole.sqlite` inside one) has its database copied there while its attachments are read in place.
 */
export async function stageMobileLibrarySource(sourcePath: string, workDirectory: string,
  attachmentsDirectory: string | null): Promise<StagedMobileLibrarySource | null> {
  const info = await stat(sourcePath);
  const folder = info.isDirectory() ? sourcePath
    : path.basename(sourcePath) === DATABASE ? path.dirname(sourcePath) : null;
  const archive = !folder && await isZipFile(sourcePath);
  if (!folder && !archive) return null;
  const root = await mkdtemp(path.join(workDirectory, '.foliole-merge-source-'));
  const dispose = () => rm(root, { recursive: true, force: true });
  try {
    const found = folder ? await stageFolder(folder, root) : await stageArchive(sourcePath, root);
    return { databasePath: path.join(root, DATABASE), attachmentsDirectory: attachmentsDirectory ?? found, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}
