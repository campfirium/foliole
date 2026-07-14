import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type {
  NativeLocalFileEntry,
  NativeLocalFileReadResult,
  NativeLocalFileSaveResult
} from '../../lib/platform/nativeLocalFileCommandMap.js';

import { openDatabaseConnection } from './connection.js';
import {
  markLocalDocumentSearchIndexMissing,
  upsertLocalDocumentSearchIndex
} from './localDocumentSearchIndex.js';
import { getSqliteConnectionCoordinator } from './sqliteConnectionCoordinator.js';

interface LocalFileRow extends Record<string, unknown> {
  absolute_path: string;
  cursor_from: number | null;
  cursor_to: number | null;
  file_size: number | null;
  id: string;
  last_opened_at: string;
  missing_at: string | null;
  modified_at: string | null;
  title: string;
}

interface FileStatSnapshot {
  fileSize: number;
  modifiedAt: string;
  modifiedMs: number;
}

function isSupportedLocalFilePath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  return extension === '.md' || extension === '.markdown' || extension === '.txt';
}

function toModifiedAt(stat: { mtimeMs: number }) {
  return new Date(stat.mtimeMs).toISOString();
}

function toTitle(absolutePath: string) {
  return path.basename(absolutePath);
}

function toEntry(row: LocalFileRow): NativeLocalFileEntry {
  return {
    absolutePath: row.absolute_path,
    cursorFrom: row.cursor_from,
    cursorTo: row.cursor_to,
    fileSize: row.file_size,
    id: row.id,
    lastOpenedAt: row.last_opened_at,
    missingAt: row.missing_at,
    modifiedAt: row.modified_at,
    title: row.title
  };
}

function indexReadyLocalDocument(row: LocalFileRow, content: string, stat: FileStatSnapshot) {
  upsertLocalDocumentSearchIndex({
    absolutePath: row.absolute_path,
    content,
    fileSize: stat.fileSize,
    lastOpenedAt: row.last_opened_at,
    modifiedAt: stat.modifiedAt,
    modifiedMs: stat.modifiedMs
  });
}

function readLocalFileRow(absolutePath: string) {
  return openDatabaseConnection().driver.queryOne<LocalFileRow>(
    `SELECT id, absolute_path, title, file_size, modified_at, last_opened_at,
      missing_at, cursor_from, cursor_to
     FROM local_files
     WHERE absolute_path = ?`,
    [absolutePath]
  );
}

function deleteMissingLocalFileRows(rows: LocalFileRow[]) {
  const missingRows = rows.filter((row) => !existsSync(row.absolute_path));
  if (missingRows.length === 0) {
    return rows;
  }
  const connection = openDatabaseConnection();
  const missingAt = new Date().toISOString();
  for (const row of missingRows) {
    connection.driver.execute('DELETE FROM local_files WHERE absolute_path = ?', [row.absolute_path]);
    markLocalDocumentSearchIndexMissing(row.absolute_path, missingAt);
  }
  const missingPaths = new Set(missingRows.map((row) => row.absolute_path));
  return rows.filter((row) => !missingPaths.has(row.absolute_path));
}

function upsertLocalFileMetadata(args: {
  absolutePath: string;
  fileSize: number | null;
  modifiedAt: string | null;
  missingAt: string | null;
}) {
  const now = new Date().toISOString();
  const existing = readLocalFileRow(args.absolutePath);
  openDatabaseConnection().driver.execute(
    `INSERT INTO local_files (
      id, absolute_path, title, file_size, modified_at, last_opened_at, missing_at,
      cursor_from, cursor_to, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
    ON CONFLICT(absolute_path) DO UPDATE SET
      title = excluded.title,
      file_size = excluded.file_size,
      modified_at = excluded.modified_at,
      last_opened_at = excluded.last_opened_at,
      missing_at = excluded.missing_at,
      updated_at = excluded.updated_at`,
    [
      existing?.id ?? randomUUID(),
      args.absolutePath,
      toTitle(args.absolutePath),
      args.fileSize,
      args.modifiedAt,
      now,
      args.missingAt,
      existing ? now : now,
      now
    ]
  );
  return readLocalFileRow(args.absolutePath);
}

function runWithLocalFileDatabaseAccess<T>(execute: () => T) {
  const connection = openDatabaseConnection();
  return getSqliteConnectionCoordinator(connection.sqlite).runExclusive(execute);
}

async function statLocalFile(absolutePath: string): Promise<FileStatSnapshot | null> {
  const stat = await fs.stat(absolutePath);
  if (!stat.isFile()) {
    return null;
  }
  return { fileSize: stat.size, modifiedAt: toModifiedAt(stat), modifiedMs: Math.round(stat.mtimeMs) };
}

export function listLocalFiles() {
  const rows = openDatabaseConnection().driver.queryAll<LocalFileRow>(
    `SELECT id, absolute_path, title, file_size, modified_at, last_opened_at,
      missing_at, cursor_from, cursor_to
     FROM local_files
     ORDER BY last_opened_at DESC, title COLLATE NOCASE ASC`
  );
  return deleteMissingLocalFileRows(rows).map(toEntry);
}

export function getLocalFileMetadata(filePath: string) {
  const row = readLocalFileRow(path.resolve(filePath));
  return row ? toEntry(row) : null;
}

export async function readLocalFile(filePath: string): Promise<NativeLocalFileReadResult> {
  const absolutePath = path.resolve(filePath);
  if (!isSupportedLocalFilePath(absolutePath)) {
    return { absolutePath, errorCode: 'unsupported_extension', message: 'Unsupported local file type.', status: 'error' };
  }
  try {
    const stat = await statLocalFile(absolutePath);
    if (!stat) {
      return { absolutePath, errorCode: 'not_a_file', message: 'Local file is not a file.', status: 'error' };
    }
    const content = await fs.readFile(absolutePath, 'utf8');
    const row = await runWithLocalFileDatabaseAccess(() => {
      const nextRow = upsertLocalFileMetadata({
        absolutePath,
        fileSize: stat.fileSize,
        missingAt: null,
        modifiedAt: stat.modifiedAt
      });
      indexReadyLocalDocument(nextRow!, content, stat);
      return nextRow;
    });
    return { ...toEntry(row!), content, status: 'ready' };
  } catch {
    const missingAt = new Date().toISOString();
    await runWithLocalFileDatabaseAccess(() => {
      upsertLocalFileMetadata({ absolutePath, fileSize: null, missingAt, modifiedAt: null });
      markLocalDocumentSearchIndexMissing(absolutePath, missingAt);
    });
    return { absolutePath, missingAt, status: 'missing', title: toTitle(absolutePath) };
  }
}

export async function saveLocalFile(args: {
  content: string;
  expectedFileSize?: number | null;
  expectedModifiedAt?: string | null;
  force?: boolean;
  path: string;
  updateSearchIndex?: boolean;
}): Promise<NativeLocalFileSaveResult> {
  const absolutePath = path.resolve(args.path);
  if (!isSupportedLocalFilePath(absolutePath)) {
    return { errorCode: 'unsupported_extension', message: 'Unsupported local file type.', status: 'error' };
  }
  try {
    const current = await statLocalFile(absolutePath);
    if (!current) {
      markLocalDocumentSearchIndexMissing(absolutePath, new Date().toISOString());
      return { errorCode: 'missing', message: 'Local file is missing.', status: 'error' };
    }
    if (
      !args.force &&
      (current.modifiedAt !== args.expectedModifiedAt || current.fileSize !== args.expectedFileSize)
    ) {
      return { ...current, status: 'conflict' };
    }
    await fs.writeFile(absolutePath, args.content, 'utf8');
    const next = await statLocalFile(absolutePath);
    if (!next) {
      return { errorCode: 'missing', message: 'Local file is missing after save.', status: 'error' };
    }
    const row = upsertLocalFileMetadata({
      absolutePath,
      fileSize: next.fileSize,
      missingAt: null,
      modifiedAt: next.modifiedAt
    });
    if (args.updateSearchIndex !== false) {
      indexReadyLocalDocument(row!, args.content, next);
    }
    return { ...next, status: 'saved' };
  } catch {
    return { errorCode: 'write_failed', message: 'Failed to save local file.', status: 'error' };
  }
}
