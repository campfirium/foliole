import type { ExternalLibraryFolder } from '../../shared/platform/externalLibraryBrowseRepository';

import {
  resolveExternalFolderDisplayLabel,
  type ExternalLibrarySelection
} from './externalLibraryBrowseModel';

export function resolveExternalSurfaceTitle(
  selection: ExternalLibrarySelection,
  selectedFolder: ExternalLibraryFolder | null
) {
  if (selection.kind === 'root') {
    return 'External library';
  }
  if (selection.kind === 'folder') {
    return selectedFolder ? resolveExternalFolderDisplayLabel(selectedFolder) : 'External folder';
  }
  if (selection.kind === 'directory') {
    return selection.directoryPath.split('/').filter(Boolean).at(-1) ?? 'Directory';
  }
  return 'Preparing document';
}

export function resolveExternalSurfaceDescription(
  selection: ExternalLibrarySelection,
  selectedFolder: ExternalLibraryFolder | null,
  error: string | null
) {
  if (error) {
    return error;
  }
  if (selection.kind === 'root') {
    return 'Select a configured external folder to browse its directories and documents.';
  }
  if (selection.kind === 'folder') {
    return selectedFolder
      ? `Browse Markdown and text files from ${resolveExternalFolderDisplayLabel(selectedFolder)}.`
      : 'Select a folder to browse.';
  }
  if (selection.kind === 'directory') {
    return 'Choose a document from the directory list to open its read-only preview.';
  }
  return 'Preparing the selected external document.';
}
