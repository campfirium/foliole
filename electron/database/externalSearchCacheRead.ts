import { resolveImportedNodeTitle } from '../../lib/core/import/importedNodeTitle.js';
import { resolveNodeOpeningText } from '../../lib/core/nodes/nodeOpeningPreview.js';
import type {
  NativeExternalSearchBrowseEntry,
  NativeExternalSearchPreview
} from '../../lib/platform/nativeStorageContract.js';

import { loadDesktopSourceByConfig, resolveDesktopSourceAddress } from './desktopSources.js';
import {
  loadActiveImportedSourceLocatorNodeIds,
  resolveImportedNodeIdForExternalDocument
} from './externalDocumentImportVisibility.js';
import { OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID } from './externalOpenedDocumentConstants.js';
import { openExternalSearchCacheDatabase } from './externalSearchCacheDatabase.js';
import { loadExternalSearchFolders } from './externalSearchFolders.js';
import { loadExternalSearchMirrorBrowseEntries } from './externalSearchMirrorRead.js';
import { resolveExternalPreviewSourceContent, rewriteExternalPreviewContent } from './externalSearchPreviewContent.js';
import { loadOpenedFilesBrowseEntries } from './openedFiles.js';
import {
  isReadwiseExternalFolderId,
  loadReadwiseExternalSearchBrowseEntries,
  loadReadwiseExternalSearchPreview
} from './readwiseManagedExternalDocuments.js';

function resolveCachedExternalAddress(folderId: string, location: string) {
  const source = loadDesktopSourceByConfig('external', folderId);
  if (!source) return null;
  return resolveDesktopSourceAddress(source.source_ref, location, { requireAvailableRoot: false });
}

export function loadExternalSearchBrowseEntries(folderId: string): NativeExternalSearchBrowseEntry[] {
  const mirrorEntries = loadExternalSearchMirrorBrowseEntries(folderId);
  if (mirrorEntries) return mirrorEntries;
  if (isReadwiseExternalFolderId(folderId)) {
    return loadReadwiseExternalSearchBrowseEntries(folderId);
  }
  if (folderId === OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID) {
    return loadOpenedFilesBrowseEntries();
  }
  const importedNodeIdsByLocator = loadActiveImportedSourceLocatorNodeIds();
  return (
    openExternalSearchCacheDatabase()
      .prepare(
      `SELECT absolute_path, content, extension, file_name, folder_id, folder_path, is_present,
        last_opened_at, modified_at, relative_path
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
      is_present: number;
      last_opened_at: string | null;
      modified_at: string;
      relative_path: string;
    }>
  ).flatMap((row) => {
    const source = loadDesktopSourceByConfig('external', row.folder_id);
    if (!source) return [];
    const currentAddress = resolveCachedExternalAddress(row.folder_id, row.relative_path);
    if (!currentAddress) return [];
    const title = resolveImportedNodeTitle({
      content: row.content,
      sourceName: row.relative_path,
      titleStrategy: 'heading'
    });
    return [{
      absolute_path: currentAddress,
      extension: row.extension,
      file_name: row.file_name,
      folder_id: row.folder_id,
      folder_path: source.root_path,
      imported_node_id: resolveImportedNodeIdForExternalDocument(currentAddress, importedNodeIdsByLocator),
      is_present: row.is_present === 1,
      last_opened_at: row.last_opened_at,
      modified_at: row.modified_at,
      opening_text: resolveNodeOpeningText(row.content, title),
      relative_path: row.relative_path,
      reference: { absolute_path: currentAddress, kind: 'local_path' },
      title
    } satisfies NativeExternalSearchBrowseEntry];
  });
}

export function resolveExternalSourceLocationByAddress(absolutePath: string) {
  const rows = openExternalSearchCacheDatabase().prepare(
    `SELECT absolute_path, folder_id, relative_path FROM external_search_documents WHERE is_present = 1`
  ).all() as Array<{ absolute_path: string; folder_id: string; relative_path: string }>;
  return rows.find((row) => {
    return resolveCachedExternalAddress(row.folder_id, row.relative_path) === absolutePath;
  }) ?? null;
}

export function loadExternalSearchPreview(absolutePath: string): NativeExternalSearchPreview | null {
  const resolvedLocation = resolveExternalSourceLocationByAddress(absolutePath);
  if (!resolvedLocation) return loadReadwiseExternalSearchPreview(absolutePath);
  const row = openExternalSearchCacheDatabase()
    .prepare(
      `SELECT absolute_path, folder_id, folder_path, relative_path, file_name, extension, content,
        is_present, last_opened_at, modified_at
       FROM external_search_documents
       WHERE absolute_path = ? AND (is_present = 1 OR folder_id = ?)`
    )
    .get(resolvedLocation.absolute_path, OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID) as {
    absolute_path: string;
    content: string;
    extension: 'md' | 'txt';
    file_name: string;
    folder_id: string;
    folder_path: string;
    is_present: number;
    last_opened_at: string | null;
    modified_at: string | null;
    relative_path: string;
  } | undefined;
  if (!row) return null;
  const currentAddress = resolveCachedExternalAddress(row.folder_id, row.relative_path);
  if (!currentAddress) return null;
  const importedNodeId = resolveImportedNodeIdForExternalDocument(currentAddress);
  const folder = loadExternalSearchFolders().find((item) => item.id === row.folder_id) ?? null;
  const previewContent = resolveExternalPreviewSourceContent(row.content, currentAddress);
  return {
    ...row,
    absolute_path: currentAddress,
    editable: false,
    content:
      row.extension === 'md'
        ? rewriteExternalPreviewContent(previewContent, currentAddress, folder)
        : previewContent,
    imported_node_id: importedNodeId,
    is_present: row.is_present === 1,
    last_opened_at: row.last_opened_at,
    reference: { absolute_path: currentAddress, kind: 'local_path' },
    source_kind: 'external_document'
  };
}
