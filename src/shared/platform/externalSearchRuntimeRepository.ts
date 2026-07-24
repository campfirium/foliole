import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeTextImportResult } from '../../../lib/platform/nativeImportContract';
import type {
  NativeExternalSearchBrowseEntry,
  NativeExternalSearchFolder,
  NativeExternalSearchPreview
} from '../../../lib/platform/nativeStorageContract';

import { getElectronAPI } from './electronApi';
import {
  toRuntimeExternalSearchBrowseEntry as toBrowseEntry,
  toRuntimeExternalSearchFolder as toFolder,
  toRuntimeExternalSearchPreview as toPreview,
  type RuntimeExternalDocumentReference,
  type RuntimeExternalSearchFolder
} from './externalSearchRuntimeMapping';
import { getRuntimeInvoke } from './runtimeInvoke';

export type {
  RuntimeExternalSearchBrowseEntry,
  RuntimeExternalSearchFolder,
  RuntimeExternalSearchPreview
} from './externalSearchRuntimeMapping';

type ExternalSearchFoldersListener = (folders: RuntimeExternalSearchFolder[]) => void;

const externalSearchFoldersListeners = new Set<ExternalSearchFoldersListener>();

export function subscribeRuntimeExternalSearchFolders(listener: ExternalSearchFoldersListener) {
  externalSearchFoldersListeners.add(listener);
  return () => {
    externalSearchFoldersListeners.delete(listener);
  };
}

function notifyRuntimeExternalSearchFolders(folders: RuntimeExternalSearchFolder[]) {
  externalSearchFoldersListeners.forEach((listener) => listener(folders));
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
      claim_unowned: folder.claimUnowned === true,
      excluded_dirs: folder.excludedDirs,
      folder_path: folder.folderPath,
      id: folder.id
    }))
  });
  const nextFolders = Array.isArray(result) ? (result as NativeExternalSearchFolder[]).map((item) => toFolder(item)) : [];
  notifyRuntimeExternalSearchFolders(nextFolders);
  return nextFolders;
}

export async function setRuntimeExternalSearchFolderEnabled(folderId: string, enabled: boolean) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) return null;
  const result = await runtimeInvoke(NATIVE_COMMANDS.setExternalSearchFolderEnabled, {
    enabled, folder_id: folderId
  });
  const folders = Array.isArray(result) ? (result as NativeExternalSearchFolder[]).map(toFolder) : [];
  notifyRuntimeExternalSearchFolders(folders);
  return folders;
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
  reference: string | RuntimeExternalDocumentReference,
  options: {
    folderId?: string | undefined;
    sourceKind?: 'external_document' | 'local_file' | undefined;
  } = {}
) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  const mirrorId = typeof reference === 'string' && reference.startsWith('mirror-document:')
    ? reference.slice('mirror-document:'.length) : null;
  const result = await runtimeInvoke(NATIVE_COMMANDS.loadExternalSearchPreview, {
    ...(mirrorId ? { document_id: mirrorId }
      : typeof reference === 'string' || reference.kind === 'local_path'
        ? { absolute_path: typeof reference === 'string' ? reference : reference.absolutePath }
        : { document_id: reference.documentId }),
    ...(options.folderId ? { folder_id: options.folderId } : {}),
    ...(options.sourceKind ? { source_kind: options.sourceKind } : {})
  });
  return result ? toPreview(result as NativeExternalSearchPreview) : null;
}

export async function importRuntimeExternalSearchDocument(reference: string | RuntimeExternalDocumentReference) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  const mirrorId = typeof reference === 'string' && reference.startsWith('mirror-document:')
    ? reference.slice('mirror-document:'.length) : null;
  const args = mirrorId ? { document_id: mirrorId }
    : typeof reference === 'string' || reference.kind === 'local_path'
      ? { absolute_path: typeof reference === 'string' ? reference : reference.absolutePath }
      : { document_id: reference.documentId };
  return runtimeInvoke(NATIVE_COMMANDS.importExternalSearchDocument, args) as Promise<NativeTextImportResult | null>;
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
