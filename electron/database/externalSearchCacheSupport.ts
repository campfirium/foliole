import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { NativeExternalSearchFolder, NativeWorkspaceSearchResult } from '../../lib/platform/nativeStorageContract.js';

import {
  createExternalSearchScanRuntime,
  shouldSkipExternalSearchDirectory,
  yieldExternalSearchScanWork,
  type ExternalSearchScanRuntime
} from './externalSearchPathExclusions.js';

export interface ExternalSearchRow {
  absolute_path: string;
  file_name: string;
  folder_id: string;
  folder_path: string;
  modified_at: string;
  rank: number;
  relative_path: string;
  text: string;
}

export interface ScannedDocument {
  absolutePath: string;
  content: string;
  extension: 'md' | 'txt';
  fileName: string;
  modifiedAt: string;
  modifiedMs: number;
  relativePath: string;
  sizeBytes: number;
}

export interface ScannedDocumentEntry {
  absolutePath: string;
  extension: 'md' | 'txt';
  fileName: string;
  modifiedAt: string;
  modifiedMs: number;
  relativePath: string;
  sizeBytes: number;
}

export async function scanFolder(
  folder: NativeExternalSearchFolder,
  rootPath: string,
  currentPath: string,
  defaultExcludedNames: Set<string>,
  items: ScannedDocument[],
  autoExcludedPaths: string[] = []
): Promise<void> {
  const entries: ScannedDocumentEntry[] = [];
  await scanFolderEntries(folder, rootPath, currentPath, defaultExcludedNames, entries, createExternalSearchScanRuntime(autoExcludedPaths));
  for (const entry of entries) {
    items.push(await loadScannedDocument(entry));
  }
}

export async function scanFolderEntries(
  folder: NativeExternalSearchFolder,
  rootPath: string,
  currentPath: string,
  defaultExcludedNames: Set<string>,
  items: ScannedDocumentEntry[],
  runtime: ExternalSearchScanRuntime | undefined = undefined,
  autoExcludedPaths: string[] = []
): Promise<void> {
  const scanRuntime = runtime ?? createExternalSearchScanRuntime(autoExcludedPaths);
  const relativeDirectoryPath = path.relative(rootPath, currentPath);
  if (shouldSkipExternalSearchDirectory({
    autoExcludedPaths: scanRuntime.autoExcludedPaths,
    currentPath,
    defaultExcludedNames,
    folder,
    relativeDirectoryPath
  })) return;
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      await scanFolderEntries(folder, rootPath, absolutePath, defaultExcludedNames, items, scanRuntime);
      await yieldExternalSearchScanWork(scanRuntime);
      continue;
    }
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (extension !== '.md' && extension !== '.txt') continue;
    const stat = await fs.stat(absolutePath);
    items.push({
      absolutePath,
      extension: extension === '.md' ? 'md' : 'txt',
      fileName: entry.name,
      modifiedAt: new Date(stat.mtimeMs).toISOString(),
      modifiedMs: Math.round(stat.mtimeMs),
      relativePath: path.relative(rootPath, absolutePath).replace(/\\/g, '/'),
      sizeBytes: stat.size
    });
    await yieldExternalSearchScanWork(scanRuntime);
  }
}

export async function loadScannedDocument(entry: ScannedDocumentEntry): Promise<ScannedDocument> {
  return {
    ...entry,
    content: await fs.readFile(entry.absolutePath, 'utf8')
  };
}

export function replaceFolderDocuments(
  db: import('better-sqlite3').Database,
  folder: NativeExternalSearchFolder,
  documents: ScannedDocument[]
) {
  const deleteDocs = db.prepare('DELETE FROM external_search_documents WHERE folder_id = ?');
  const deleteFts = db.prepare('DELETE FROM external_search_fts WHERE folder_id = ?');
  const insertDoc = db.prepare(`INSERT INTO external_search_documents (
    absolute_path, folder_id, folder_path, relative_path, file_name, extension, size_bytes, modified_at, modified_ms, indexed_at, is_present, content
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertFts = db.prepare(`INSERT INTO external_search_fts (
    title, file_name, relative_path, content, absolute_path, folder_id, folder_path, modified_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const indexedAt = new Date().toISOString();
  db.transaction(() => {
    deleteDocs.run(folder.id);
    deleteFts.run(folder.id);
    documents.forEach((document) => {
      insertDoc.run(document.absolutePath, folder.id, folder.folder_path, document.relativePath, document.fileName, document.extension, document.sizeBytes, document.modifiedAt, document.modifiedMs, indexedAt, 1, document.content);
      insertFts.run(path.basename(document.fileName, path.extname(document.fileName)).trim() || document.fileName, document.fileName, document.relativePath, document.content, document.absolutePath, folder.id, folder.folder_path, document.modifiedAt);
    });
  })();
  return indexedAt;
}

export function applyFolderDocumentChanges(args: {
  db: import('better-sqlite3').Database;
  deletedAbsolutePaths: string[];
  documentsToUpsert: ScannedDocument[];
  folder: NativeExternalSearchFolder;
}) {
  const deleteFts = args.db.prepare('DELETE FROM external_search_fts WHERE absolute_path = ?');
  const markDocMissing = args.db.prepare('UPDATE external_search_documents SET is_present = 0 WHERE absolute_path = ?');
  const upsertDoc = args.db.prepare(`INSERT OR REPLACE INTO external_search_documents (
    absolute_path, folder_id, folder_path, relative_path, file_name, extension, size_bytes, modified_at, modified_ms, indexed_at, is_present, content
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertFts = args.db.prepare(`INSERT INTO external_search_fts (
    title, file_name, relative_path, content, absolute_path, folder_id, folder_path, modified_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const indexedAt = new Date().toISOString();

  args.db.transaction(() => {
    args.deletedAbsolutePaths.forEach((absolutePath) => {
      markDocMissing.run(absolutePath);
      deleteFts.run(absolutePath);
    });
    args.documentsToUpsert.forEach((document) => {
      deleteFts.run(document.absolutePath);
      upsertDoc.run(
        document.absolutePath,
        args.folder.id,
        args.folder.folder_path,
        document.relativePath,
        document.fileName,
        document.extension,
        document.sizeBytes,
        document.modifiedAt,
        document.modifiedMs,
        indexedAt,
        1,
        document.content
      );
      insertFts.run(
        path.basename(document.fileName, path.extname(document.fileName)).trim() || document.fileName,
        document.fileName,
        document.relativePath,
        document.content,
        document.absolutePath,
        args.folder.id,
        args.folder.folder_path,
        document.modifiedAt
      );
    });
  })();

  return indexedAt;
}

function buildExternalExcerpt(content: string, query: string) {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'No content preview';
  const lower = normalized.toLowerCase();
  const matchIndex = lower.indexOf(query);
  if (matchIndex < 0) return normalized.slice(0, 96);
  const start = Math.max(0, matchIndex - 36);
  const end = Math.min(normalized.length, matchIndex + query.length + 36);
  return `${start > 0 ? '...' : ''}${normalized.slice(start, end)}${end < normalized.length ? '...' : ''}`;
}

export function toExternalResult(row: ExternalSearchRow, query: string): NativeWorkspaceSearchResult {
  return {
    excerpt: buildExternalExcerpt(row.text, query),
    externalMatch: {
      absolutePath: row.absolute_path,
      folderId: row.folder_id,
      folderPath: row.folder_path,
      query,
      relativePath: row.relative_path
    },
    id: row.absolute_path,
    kind: 'external',
    nodeMatch: null,
    pdfMatch: null,
    title: row.file_name,
    updatedAt: row.modified_at
  };
}
