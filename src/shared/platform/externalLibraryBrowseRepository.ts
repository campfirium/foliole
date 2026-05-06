import {
  loadRuntimeExternalSearchBrowseEntries,
  loadRuntimeExternalSearchFolders,
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
