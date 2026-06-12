import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import type { NativeExternalSearchPreview } from '../../lib/platform/nativeStorageContract.js';
import { OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID, OPENED_EXTERNAL_DOCUMENTS_FOLDER_PATH } from '../database/externalOpenedDocumentConstants.js';
import {
  recordOpenedExternalDocument,
  refreshOpenedExternalDocumentRows
} from '../database/externalOpenedDocuments.js';
import { rebuildExternalSearchIndexes } from '../database/externalSearchCache.js';
import { pruneExternalSearchCache } from '../database/externalSearchCacheMaintenance.js';
import {
  loadExternalSearchBrowseEntries,
  loadExternalSearchPreview
} from '../database/externalSearchCacheRead.js';
import { loadExternalSearchFolders, saveExternalSearchFolders } from '../database/externalSearchFolders.js';
import { getLocalFileMetadata, readLocalFile } from '../database/localFiles.js';
import { loadOpenedFilesFolder } from '../database/openedFiles.js';
import { loadReadwiseExternalSearchFolders } from '../database/readwiseManagedExternalDocuments.js';
import { notifyExternalSearchFoldersChanged } from '../externalSearchBackgroundRefreshRuntime.js';

import { asNullableString, asString } from './commandParsers.js';

function appendManagedExternalSearchFolders(savedFolders: ReturnType<typeof loadExternalSearchFolders>) {
  return [
    ...savedFolders,
    ...[loadOpenedFilesFolder()].filter((folder) => folder !== null),
    ...loadReadwiseExternalSearchFolders()
  ];
}

async function loadOpenedFilePreview(
  absolutePath: string,
  sourceKind?: 'external_document' | 'local_file'
): Promise<NativeExternalSearchPreview | null> {
  if (sourceKind === 'local_file' || shouldLoadOpenedLocalFilePreview(absolutePath)) {
    return loadLocalFilePreview(absolutePath);
  }
  const preview = loadExternalSearchPreview(absolutePath);
  if (preview) {
    return preview;
  }
  return loadLocalFilePreview(absolutePath);
}

function shouldLoadOpenedLocalFilePreview(absolutePath: string) {
  const metadata = getLocalFileMetadata(absolutePath);
  return Boolean(metadata && metadata.missingAt === null);
}

async function loadLocalFilePreview(absolutePath: string): Promise<NativeExternalSearchPreview | null> {
  const result = await readLocalFile(absolutePath);
  if (result.status !== 'ready') {
    return null;
  }
  return {
    absolute_path: result.absolutePath,
    content: result.content,
    editable: true,
    extension: result.absolutePath.toLowerCase().endsWith('.txt') ? 'txt' : 'md',
    file_name: result.title,
    file_size: result.fileSize,
    folder_id: OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID,
    folder_path: OPENED_EXTERNAL_DOCUMENTS_FOLDER_PATH,
    imported_node_id: null,
    is_present: true,
    last_opened_at: result.lastOpenedAt,
    modified_at: result.modifiedAt,
    relative_path: result.absolutePath,
    source_kind: 'local_file'
  };
}

export function handleExternalSearchStorageCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.loadExternalSearchFolders) {
    return refreshOpenedExternalDocumentRows().then(() => appendManagedExternalSearchFolders(loadExternalSearchFolders()));
  }
  if (command === NATIVE_COMMANDS.saveExternalSearchFolders) {
    const folders = Array.isArray(args.folders) ? args.folders : [];
    const savedFolders = saveExternalSearchFolders(folders as Parameters<typeof saveExternalSearchFolders>[0]);
    pruneExternalSearchCache(savedFolders.map((folder) => folder.id));
    notifyExternalSearchFoldersChanged();
    return appendManagedExternalSearchFolders(savedFolders);
  }
  if (command === NATIVE_COMMANDS.rebuildExternalSearchIndex) {
    return rebuildExternalSearchIndexes(asNullableString(args.folder_id, 'folder_id') ?? undefined);
  }
  if (command === NATIVE_COMMANDS.loadExternalSearchBrowseEntries) {
    return loadExternalSearchBrowseEntries(asString(args.folder_id, 'folder_id'));
  }
  if (command === NATIVE_COMMANDS.loadExternalSearchPreview) {
    const sourceKind = asNullableString(args.source_kind, 'source_kind');
    return loadOpenedFilePreview(
      asString(args.absolute_path, 'absolute_path'),
      sourceKind === 'external_document' || sourceKind === 'local_file' ? sourceKind : undefined
    );
  }
  if (command === NATIVE_COMMANDS.openExternalDocumentFile) {
    return recordOpenedExternalDocument(asString(args.path, 'path'));
  }
  return undefined;
}
