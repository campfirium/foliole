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
  return loadRuntimeExternalSearchFolders();
}

export function loadExternalLibraryBrowseEntries(folderId: string) {
  return loadRuntimeExternalSearchBrowseEntries(folderId);
}

export function subscribeExternalLibraryFolders(listener: (folders: ExternalLibraryFolder[]) => void) {
  return subscribeRuntimeExternalSearchFolders(listener);
}

export function rebuildExternalLibraryIndex(folderId?: string) {
  return rebuildRuntimeExternalSearchIndex(folderId);
}

export function subscribeExternalLibraryDocumentFileOpened(
  handler: (payload: { absolutePath: string; folderId: string }) => void
) {
  return subscribeRuntimeExternalDocumentFileOpened(handler);
}
