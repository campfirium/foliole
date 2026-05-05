import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeTextImportResult } from '../../../lib/platform/nativeImportContract';
import type {
  NativeExternalSearchAttachmentMode,
  NativeExternalSearchFolder,
  NativeExternalSearchPreview
} from '../../../lib/platform/nativeStorageContract';

import { getRuntimeInvoke } from './bridge';

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
  extension: 'md' | 'txt';
  fileName: string;
  folderId: string;
  folderPath: string;
  relativePath: string;
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
    extension: value.extension,
    fileName: value.file_name,
    folderId: value.folder_id,
    folderPath: value.folder_path,
    relativePath: value.relative_path
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
  return Array.isArray(result) ? (result as NativeExternalSearchFolder[]).map((item) => toFolder(item)) : [];
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
  return Array.isArray(result) ? (result as NativeExternalSearchFolder[]).map((item) => toFolder(item)) : [];
}

export async function loadRuntimeExternalSearchPreview(absolutePath: string) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  const result = await runtimeInvoke(NATIVE_COMMANDS.loadExternalSearchPreview, { absolute_path: absolutePath });
  return result ? toPreview(result as NativeExternalSearchPreview) : null;
}

export async function importRuntimeExternalSearchDocument(absolutePath: string) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return runtimeInvoke(NATIVE_COMMANDS.importExternalSearchDocument, { absolute_path: absolutePath }) as Promise<NativeTextImportResult | null>;
}
