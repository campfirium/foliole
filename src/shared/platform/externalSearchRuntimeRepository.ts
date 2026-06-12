import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeTextImportResult } from '../../../lib/platform/nativeImportContract';
import type {
  NativeExternalSearchAttachmentMode,
  NativeExternalSearchBrowseEntry,
  NativeExternalSearchFolder,
  NativeExternalSearchPreview
} from '../../../lib/platform/nativeStorageContract';

import { getElectronAPI } from './electronApi';
import { getRuntimeInvoke } from './runtimeInvoke';

type ExternalSearchFoldersListener = (folders: RuntimeExternalSearchFolder[]) => void;

const externalSearchFoldersListeners = new Set<ExternalSearchFoldersListener>();

export interface RuntimeExternalSearchFolder {
  attachmentMode: NativeExternalSearchAttachmentMode;
  attachmentRootPath: string | null;
  createdAt: string;
  documentCount: number;
  excludedDirs: string[];
  folderPath: string;
  id: string;
  indexedAt: string | null;
  lastError: string | null;
  status: 'error' | 'idle' | 'indexing' | 'ready';
  updatedAt: string;
}

export interface RuntimeExternalSearchPreview {
  absolutePath: string;
  content: string;
  editable?: boolean | undefined;
  extension: 'md' | 'txt';
  fileName: string;
  fileSize?: number | null;
  folderId: string;
  folderPath: string;
  importedNodeId?: string | null;
  isPresent?: boolean | undefined;
  lastOpenedAt?: string | null;
  modifiedAt?: string | null;
  relativePath: string;
  sourceKind?: 'external_document' | 'local_file' | undefined;
}

export interface RuntimeExternalSearchBrowseEntry {
  absolutePath: string;
  editable?: boolean | undefined;
  extension: 'md' | 'txt';
  fileName: string;
  fileSize?: number | null;
  folderId: string;
  folderPath: string;
  importedNodeId?: string | null;
  isPresent?: boolean | undefined;
  lastOpenedAt?: string | null;
  modifiedAt: string;
  openingText: string | null;
  relativePath: string;
  sourceKind?: 'external_document' | 'local_file' | undefined;
  title: string;
}

export function subscribeRuntimeExternalSearchFolders(listener: ExternalSearchFoldersListener) {
  externalSearchFoldersListeners.add(listener);
  return () => {
    externalSearchFoldersListeners.delete(listener);
  };
}

function notifyRuntimeExternalSearchFolders(folders: RuntimeExternalSearchFolder[]) {
  externalSearchFoldersListeners.forEach((listener) => listener(folders));
}

function toFolder(value: NativeExternalSearchFolder): RuntimeExternalSearchFolder {
  return {
    attachmentMode: value.attachment_mode,
    attachmentRootPath: value.attachment_root_path,
    createdAt: value.created_at,
    documentCount: value.document_count,
    excludedDirs: value.excluded_dirs,
    folderPath: value.folder_path,
    id: value.id,
    indexedAt: value.indexed_at,
    lastError: value.last_error,
    status: value.status,
    updatedAt: value.updated_at
  };
}

function toPreview(value: NativeExternalSearchPreview): RuntimeExternalSearchPreview {
  return {
    absolutePath: value.absolute_path,
    content: value.content,
    editable: value.editable,
    extension: value.extension,
    fileName: value.file_name,
    fileSize: value.file_size ?? null,
    folderId: value.folder_id,
    folderPath: value.folder_path,
    importedNodeId: value.imported_node_id ?? null,
    isPresent: value.is_present,
    lastOpenedAt: value.last_opened_at ?? null,
    modifiedAt: value.modified_at ?? null,
    relativePath: value.relative_path,
    sourceKind: value.source_kind
  };
}

function toBrowseEntry(value: NativeExternalSearchBrowseEntry): RuntimeExternalSearchBrowseEntry {
  return {
    absolutePath: value.absolute_path,
    editable: value.editable,
    extension: value.extension,
    fileName: value.file_name,
    fileSize: value.file_size ?? null,
    folderId: value.folder_id,
    folderPath: value.folder_path,
    importedNodeId: value.imported_node_id ?? null,
    isPresent: value.is_present,
    lastOpenedAt: value.last_opened_at ?? null,
    modifiedAt: value.modified_at,
    openingText: value.opening_text,
    relativePath: value.relative_path,
    sourceKind: value.source_kind,
    title: value.title
  };
}

export async function loadRuntimeExternalSearchFolders() {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  const result = await runtimeInvoke(NATIVE_COMMANDS.loadExternalSearchFolders);
  return Array.isArray(result) ? (result as NativeExternalSearchFolder[]).map((item) => toFolder(item)) : [];
}

export async function refreshRuntimeExternalSearchFolders() {
  const folders = await loadRuntimeExternalSearchFolders();
  if (folders) {
    notifyRuntimeExternalSearchFolders(folders);
  }
  return folders;
}

export async function saveRuntimeExternalSearchFolders(folders: RuntimeExternalSearchFolder[]) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  const result = await runtimeInvoke(NATIVE_COMMANDS.saveExternalSearchFolders, {
    folders: folders.map((folder) => ({
      attachment_mode: 'document_relative_first_then_fixed_root',
      attachment_root_path: folder.attachmentRootPath,
      excluded_dirs: folder.excludedDirs,
      folder_path: folder.folderPath,
      id: folder.id
    }))
  });
  const nextFolders = Array.isArray(result) ? (result as NativeExternalSearchFolder[]).map((item) => toFolder(item)) : [];
  notifyRuntimeExternalSearchFolders(nextFolders);
  return nextFolders;
}

export async function rebuildRuntimeExternalSearchIndex(folderId?: string) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  const result = await runtimeInvoke(
    NATIVE_COMMANDS.rebuildExternalSearchIndex,
    folderId ? { folder_id: folderId } : undefined
  );
  const nextFolders = Array.isArray(result) ? (result as NativeExternalSearchFolder[]).map((item) => toFolder(item)) : [];
  notifyRuntimeExternalSearchFolders(nextFolders);
  return nextFolders;
}

export async function loadRuntimeExternalSearchBrowseEntries(folderId: string) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  const result = await runtimeInvoke(NATIVE_COMMANDS.loadExternalSearchBrowseEntries, { folder_id: folderId });
  return Array.isArray(result) ? (result as NativeExternalSearchBrowseEntry[]).map((item) => toBrowseEntry(item)) : [];
}

export async function loadRuntimeExternalSearchPreview(
  absolutePath: string,
  options: {
    folderId?: string | undefined;
    sourceKind?: 'external_document' | 'local_file' | undefined;
  } = {}
) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  const result = await runtimeInvoke(NATIVE_COMMANDS.loadExternalSearchPreview, {
    absolute_path: absolutePath,
    ...(options.folderId ? { folder_id: options.folderId } : {}),
    ...(options.sourceKind ? { source_kind: options.sourceKind } : {})
  });
  return result ? toPreview(result as NativeExternalSearchPreview) : null;
}

export async function importRuntimeExternalSearchDocument(absolutePath: string) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return runtimeInvoke(NATIVE_COMMANDS.importExternalSearchDocument, { absolute_path: absolutePath }) as Promise<NativeTextImportResult | null>;
}

export async function openRuntimeExternalDocumentFile(path: string) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  const result = await runtimeInvoke(NATIVE_COMMANDS.openExternalDocumentFile, { path });
  return result ? toBrowseEntry(result as NativeExternalSearchBrowseEntry) : null;
}

export function subscribeRuntimeExternalDocumentFileOpened(
  handler: (payload: { absolutePath: string; folderId: string; sourceKind?: 'external_document' | 'local_file' }) => void
) {
  return getElectronAPI()?.onExternalDocumentFileOpened?.(handler) ?? (() => undefined);
}
