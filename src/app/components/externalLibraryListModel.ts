import type { ExternalLibraryBrowseEntry, ExternalLibraryFolder } from '../../shared/platform/externalLibraryBrowseRepository';

import {
  buildExternalLibraryFolderBrowseState,
  isReadwiseExternalFolder,
  type ExternalLibrarySelection
} from './externalLibraryBrowseModel';

export function resolveExternalDocuments(
  folders: ExternalLibraryFolder[],
  entriesByFolderId: Record<string, ExternalLibraryBrowseEntry[] | undefined>,
  selection: ExternalLibrarySelection
) {
  if ('folderId' in selection) {
    const folder = folders.find((candidate) => candidate.id === selection.folderId);
    const entries = folder && entriesByFolderId[folder.id];
    return {
      isLoading: Boolean(folder && entries === undefined),
      items: folder && entries ? buildExternalLibraryFolderBrowseState(folder, entries, selection).documentItems : [],
      scopeKey: `folder:${selection.folderId}`
    };
  }

  const selectedFolders = selection.kind === 'group' ? folders.filter(isReadwiseExternalFolder) : folders;
  const documentsByPath = new Map<string, ExternalLibraryBrowseEntry>();
  for (const folder of selectedFolders) {
    for (const entry of entriesByFolderId[folder.id] ?? []) {
      if (!documentsByPath.has(entry.absolutePath)) documentsByPath.set(entry.absolutePath, entry);
    }
  }
  return {
    isLoading: selectedFolders.some((folder) => entriesByFolderId[folder.id] === undefined),
    items: [...documentsByPath.values()],
    scopeKey: selection.kind === 'group' ? `group:${selection.groupId}` : 'root'
  };
}
