import { getExternalFolderRuntimeProvider } from './externalFolderRuntime';
import {
  loadRuntimeExternalSearchBrowseEntries,
  loadRuntimeExternalSearchFolders,
  rebuildRuntimeExternalSearchIndex,
  subscribeRuntimeExternalDocumentFileOpened,
  subscribeRuntimeExternalSearchFolders,
  type RuntimeExternalSearchBrowseEntry,
  type RuntimeExternalSearchFolder
} from './externalSearchRuntimeRepository';

export type ExternalLibraryBrowseEntry = RuntimeExternalSearchBrowseEntry;
export type ExternalLibraryFolder = RuntimeExternalSearchFolder;

function enabledLibraryFolders(folders: ExternalLibraryFolder[]) {
  return folders.filter((folder) => folder.accessMode !== 'remote_mirror' || folder.mirrorEnabled !== false);
}

export function loadExternalLibraryFolders() {
  return getExternalFolderRuntimeProvider().loadFolders().then(async (folders) =>
    enabledLibraryFolders(folders ?? await loadRuntimeExternalSearchFolders() ?? [])
  );
}

export function loadExternalLibraryBrowseEntries(folderId: string) {
  return getExternalFolderRuntimeProvider().loadBrowseEntries(folderId).then((entries) =>
    entries ?? loadRuntimeExternalSearchBrowseEntries(folderId)
  );
}

export function subscribeExternalLibraryFolders(listener: (folders: ExternalLibraryFolder[]) => void) {
  const filteredListener = (folders: ExternalLibraryFolder[]) => listener(enabledLibraryFolders(folders));
  const unsubscribeProvider = getExternalFolderRuntimeProvider().subscribeFolders(filteredListener);
  const unsubscribeRuntime = subscribeRuntimeExternalSearchFolders(filteredListener);
  return () => {
    unsubscribeProvider();
    unsubscribeRuntime();
  };
}

export function rebuildExternalLibraryIndex(folderId?: string) {
  return getExternalFolderRuntimeProvider().rebuildIndex(folderId).then((folders) =>
    folders ?? rebuildRuntimeExternalSearchIndex(folderId)
  );
}

export function subscribeExternalLibraryDocumentFileOpened(
  handler: (payload: { absolutePath: string; folderId: string; sourceKind?: 'external_document' | 'local_file' }) => void
) {
  return subscribeRuntimeExternalDocumentFileOpened(handler);
}
