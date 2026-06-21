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

export function loadExternalLibraryFolders() {
  return getExternalFolderRuntimeProvider().loadFolders().then((folders) => folders ?? loadRuntimeExternalSearchFolders());
}

export function loadExternalLibraryBrowseEntries(folderId: string) {
  return getExternalFolderRuntimeProvider().loadBrowseEntries(folderId).then((entries) =>
    entries ?? loadRuntimeExternalSearchBrowseEntries(folderId)
  );
}

export function subscribeExternalLibraryFolders(listener: (folders: ExternalLibraryFolder[]) => void) {
  const unsubscribeProvider = getExternalFolderRuntimeProvider().subscribeFolders(listener);
  const unsubscribeRuntime = subscribeRuntimeExternalSearchFolders(listener);
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
