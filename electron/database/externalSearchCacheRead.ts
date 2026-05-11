import { resolveImportedNodeTitle } from '../../lib/core/import/importedNodeTitle.js';
import { resolveNodeOpeningText } from '../../lib/core/nodes/nodeOpeningPreview.js';
import type {
  NativeExternalSearchBrowseEntry,
  NativeExternalSearchPreview
} from '../../lib/platform/nativeStorageContract.js';

import { openExternalSearchCacheDatabase } from './externalSearchCacheDatabase.js';
import { loadExternalSearchFolders } from './externalSearchFolders.js';
import { resolveExternalPreviewSourceContent, rewriteExternalPreviewContent } from './externalSearchPreviewContent.js';
import {
  isReadwiseExternalFolderId,
  loadReadwiseExternalSearchBrowseEntries,
  loadReadwiseExternalSearchPreview
} from './readwiseManagedExternalDocuments.js';

export function loadExternalSearchBrowseEntries(folderId: string): NativeExternalSearchBrowseEntry[] {
  if (isReadwiseExternalFolderId(folderId)) {
    return loadReadwiseExternalSearchBrowseEntries(folderId);
  }
  return (
    openExternalSearchCacheDatabase()
      .prepare(
        `SELECT absolute_path, content, extension, file_name, folder_id, folder_path, modified_at, relative_path
       FROM external_search_documents
       WHERE folder_id = ? AND is_present = 1
       ORDER BY relative_path COLLATE NOCASE ASC`
      )
      .all(folderId) as Array<{
      absolute_path: string;
      content: string;
      extension: 'md' | 'txt';
      file_name: string;
      folder_id: string;
      folder_path: string;
      modified_at: string;
      relative_path: string;
    }>
  ).map((row) => {
    const title = resolveImportedNodeTitle({
      content: row.content,
      sourceName: row.relative_path,
      titleStrategy: 'heading'
    });
    return {
      absolute_path: row.absolute_path,
      extension: row.extension,
      file_name: row.file_name,
      folder_id: row.folder_id,
      folder_path: row.folder_path,
      modified_at: row.modified_at,
      opening_text: resolveNodeOpeningText(row.content, title),
      relative_path: row.relative_path,
      title
    } satisfies NativeExternalSearchBrowseEntry;
  });
}

export function loadExternalSearchPreview(absolutePath: string): NativeExternalSearchPreview | null {
  const row = openExternalSearchCacheDatabase()
    .prepare(
      `SELECT absolute_path, folder_id, folder_path, relative_path, file_name, extension, content
       FROM external_search_documents
       WHERE absolute_path = ? AND is_present = 1`
    )
    .get(absolutePath) as {
    absolute_path: string;
    content: string;
    extension: 'md' | 'txt';
    file_name: string;
    folder_id: string;
    folder_path: string;
    relative_path: string;
  } | undefined;
  if (!row) {
    return loadReadwiseExternalSearchPreview(absolutePath);
  }
  const folder = loadExternalSearchFolders().find((item) => item.id === row.folder_id) ?? null;
  const previewContent = resolveExternalPreviewSourceContent(row.content, row.absolute_path);
  return {
    ...row,
    content:
      row.extension === 'md'
        ? rewriteExternalPreviewContent(previewContent, row.absolute_path, folder)
        : previewContent
  };
}
