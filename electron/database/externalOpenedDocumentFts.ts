import path from 'node:path';

import {
  OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID,
  OPENED_EXTERNAL_DOCUMENTS_FOLDER_PATH
} from './externalOpenedDocumentConstants.js';

export function writeOpenedDocumentFts(db: import('better-sqlite3').Database, row: {
  absolutePath: string;
  content: string;
  fileName: string;
  folderId?: string;
  folderPath?: string;
  modifiedAt: string;
  relativePath?: string;
}) {
  const folderId = row.folderId ?? OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID;
  const folderPath = row.folderPath ?? OPENED_EXTERNAL_DOCUMENTS_FOLDER_PATH;
  db.prepare('DELETE FROM external_search_fts WHERE absolute_path = ?').run(row.absolutePath);
  db.prepare(`INSERT INTO external_search_fts (
    title, file_name, relative_path, content, absolute_path, folder_id, folder_path, modified_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    path.basename(row.fileName, path.extname(row.fileName)).trim() || row.fileName,
    row.fileName,
    row.relativePath ?? row.absolutePath,
    row.content,
    row.absolutePath,
    folderId,
    folderPath,
    row.modifiedAt
  );
}
