import type { ExternalSourceSettingsFolder } from '../../../shared/platform/externalSourceSettingsRepository';

export function serializeEditableExternalFolders(folders: ExternalSourceSettingsFolder[]) {
  return JSON.stringify(
    folders.filter((folder) => folder.accessMode !== 'remote_mirror').map((folder) => ({
      attachmentMode: 'document_relative_first_then_fixed_root',
      attachmentRootPath: folder.attachmentRootPath?.trim() || null,
      claimUnowned: folder.claimUnowned === true,
      excludedDirs: folder.excludedDirs,
      folderPath: folder.folderPath,
      id: folder.id
    }))
  );
}
