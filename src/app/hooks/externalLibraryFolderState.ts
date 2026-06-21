import type { ExternalLibrarySelection } from '../components/externalLibraryBrowseModel';

import type {
  ExternalLibraryBrowseEntry,
  ExternalLibraryFolder
} from '@/shared/platform/externalLibraryBrowseRepository';

export function retainEntriesForCurrentFolders(
  current: Record<string, ExternalLibraryBrowseEntry[] | undefined>,
  previousFolders: ExternalLibraryFolder[],
  nextFolders: ExternalLibraryFolder[]
) {
  const previousById = new Map(previousFolders.map((folder) => [folder.id, folder]));
  const next: Record<string, ExternalLibraryBrowseEntry[] | undefined> = {};
  let changed = false;

  nextFolders.forEach((folder) => {
    const cachedEntries = current[folder.id];
    if (cachedEntries === undefined) {
      return;
    }
    const previousFolder = previousById.get(folder.id);
    if (previousFolder && isExternalFolderEntryCacheCurrent(previousFolder, folder)) {
      next[folder.id] = cachedEntries;
    } else {
      changed = true;
    }
  });

  if (Object.keys(current).some((folderId) => !Object.prototype.hasOwnProperty.call(next, folderId))) {
    changed = true;
  }

  return changed ? next : current;
}

export function resolveExternalSelectionAfterFoldersChanged(
  current: ExternalLibrarySelection,
  folders: ExternalLibraryFolder[]
): ExternalLibrarySelection {
  if (current.kind === 'root') {
    return current;
  }
  return folders.some((folder) => folder.id === current.folderId) ? current : { kind: 'root' };
}

function isExternalFolderEntryCacheCurrent(
  previousFolder: ExternalLibraryFolder,
  nextFolder: ExternalLibraryFolder
) {
  return (
    previousFolder.documentCount === nextFolder.documentCount &&
    previousFolder.folderPath === nextFolder.folderPath &&
    previousFolder.indexedAt === nextFolder.indexedAt &&
    previousFolder.status === nextFolder.status
  );
}
