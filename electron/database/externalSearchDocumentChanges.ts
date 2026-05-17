import path from 'node:path';

import type { NativeExternalSearchFolder } from '../../lib/platform/nativeStorageContract.js';

import type { ExternalSearchWorkContext, ScannedDocument } from './externalSearchCacheSupport.js';

interface FolderDocumentChangeArgs {
  db: import('better-sqlite3').Database;
  deletedAbsolutePaths: string[];
  documentChunkSize?: number;
  documentsToUpsert: ScannedDocument[];
  folder: NativeExternalSearchFolder;
  context?: ExternalSearchWorkContext;
}

async function applyDeletedExternalSearchChunks(args: FolderDocumentChangeArgs & {
  completed: number;
  deleteFts: import('better-sqlite3').Statement;
  markDocMissing: import('better-sqlite3').Statement;
  total: number;
}) {
  const chunkSize = args.documentChunkSize ?? 100;
  let completed = args.completed;
  for (let index = 0; index < args.deletedAbsolutePaths.length; index += chunkSize) {
    const chunk = args.deletedAbsolutePaths.slice(index, index + chunkSize);
    args.db.transaction(() => {
      chunk.forEach((absolutePath) => {
        args.markDocMissing.run(absolutePath);
        args.deleteFts.run(absolutePath);
      });
    })();
    completed += chunk.length;
    args.context?.progress?.({ completed, message: 'wrote external search delete chunk', total: args.total, unit: 'document' });
    await args.context?.yieldIfNeeded?.();
  }
  return completed;
}

function writeExternalSearchDocument(args: FolderDocumentChangeArgs & {
  deleteFts: import('better-sqlite3').Statement;
  document: ScannedDocument;
  indexedAt: string;
  insertFts: import('better-sqlite3').Statement;
  upsertDoc: import('better-sqlite3').Statement;
}) {
  args.deleteFts.run(args.document.absolutePath);
  args.upsertDoc.run(
    args.document.absolutePath,
    args.folder.id,
    args.folder.folder_path,
    args.document.relativePath,
    args.document.fileName,
    args.document.extension,
    args.document.sizeBytes,
    args.document.modifiedAt,
    args.document.modifiedMs,
    args.indexedAt,
    1,
    args.document.content
  );
  args.insertFts.run(
    path.basename(args.document.fileName, path.extname(args.document.fileName)).trim() || args.document.fileName,
    args.document.fileName,
    args.document.relativePath,
    args.document.content,
    args.document.absolutePath,
    args.folder.id,
    args.folder.folder_path,
    args.document.modifiedAt
  );
}

async function applyUpsertExternalSearchChunks(args: FolderDocumentChangeArgs & {
  completed: number;
  deleteFts: import('better-sqlite3').Statement;
  indexedAt: string;
  insertFts: import('better-sqlite3').Statement;
  total: number;
  upsertDoc: import('better-sqlite3').Statement;
}) {
  const chunkSize = args.documentChunkSize ?? 100;
  let completed = args.completed;
  for (let index = 0; index < args.documentsToUpsert.length; index += chunkSize) {
    const chunk = args.documentsToUpsert.slice(index, index + chunkSize);
    args.db.transaction(() => {
      chunk.forEach((document) => writeExternalSearchDocument({ ...args, document }));
    })();
    completed += chunk.length;
    args.context?.progress?.({ completed, message: 'wrote external search upsert chunk', total: args.total, unit: 'document' });
    await args.context?.yieldIfNeeded?.();
  }
  return completed;
}

export async function applyFolderDocumentChanges(args: FolderDocumentChangeArgs) {
  const deleteFts = args.db.prepare('DELETE FROM external_search_fts WHERE absolute_path = ?');
  const markDocMissing = args.db.prepare('UPDATE external_search_documents SET is_present = 0 WHERE absolute_path = ?');
  const upsertDoc = args.db.prepare(`INSERT OR REPLACE INTO external_search_documents (
    absolute_path, folder_id, folder_path, relative_path, file_name, extension, size_bytes, modified_at, modified_ms, indexed_at, is_present, content
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertFts = args.db.prepare(`INSERT INTO external_search_fts (
    title, file_name, relative_path, content, absolute_path, folder_id, folder_path, modified_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const indexedAt = new Date().toISOString();
  const total = args.deletedAbsolutePaths.length + args.documentsToUpsert.length;
  const completed = await applyDeletedExternalSearchChunks({ ...args, completed: 0, deleteFts, markDocMissing, total });
  await applyUpsertExternalSearchChunks({ ...args, completed, deleteFts, indexedAt, insertFts, total, upsertDoc });
  return indexedAt;
}
