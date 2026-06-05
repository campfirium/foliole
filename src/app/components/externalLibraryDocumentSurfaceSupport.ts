import type { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { ExternalLibraryFolder } from '../../shared/platform/externalLibraryBrowseRepository';

import {
  resolveExternalFolderDisplayLabel,
  type ExternalLibrarySelection
} from './externalLibraryBrowseModel';

type ExternalLibraryTranslate = ReturnType<typeof useTranslation>;

export function resolveExternalSurfaceTitle(
  selection: ExternalLibrarySelection,
  selectedFolder: ExternalLibraryFolder | null,
  t: ExternalLibraryTranslate
) {
  if (selection.kind === 'root') {
    return t('desktop.externalLibrary.rootTitle');
  }
  if (selection.kind === 'folder') {
    return selectedFolder ? resolveExternalFolderDisplayLabel(selectedFolder) : t('desktop.externalLibrary.folderFallback');
  }
  if (selection.kind === 'directory') {
    return selection.directoryPath.split('/').filter(Boolean).at(-1) ?? t('desktop.externalLibrary.directoryFallback');
  }
  return t('desktop.externalLibrary.preparingDocument');
}

export function resolveExternalSurfaceDescription(
  selection: ExternalLibrarySelection,
  selectedFolder: ExternalLibraryFolder | null,
  error: string | null,
  t: ExternalLibraryTranslate
) {
  if (error) {
    return error;
  }
  if (selection.kind === 'root') {
    return t('desktop.externalLibrary.rootDescription');
  }
  if (selection.kind === 'folder') {
    return selectedFolder
      ? t('desktop.externalLibrary.folderDescription', { folder: resolveExternalFolderDisplayLabel(selectedFolder) })
      : t('desktop.externalLibrary.folderMissingDescription');
  }
  if (selection.kind === 'directory') {
    return t('desktop.externalLibrary.directoryDescription');
  }
  return t('desktop.externalLibrary.preparingDescription');
}
