import {
  loadRuntimeExternalSearchFolders,
  rebuildRuntimeExternalSearchIndex,
  saveRuntimeExternalSearchFolders,
  type RuntimeExternalSearchFolder
} from './externalSearchRuntimeRepository';
import { selectRuntimeFolder } from './folderSelectionRuntimeRepository';

export type ExternalSourceSettingsFolder = RuntimeExternalSearchFolder;

export type ExternalSourceSettingsFolderPatch = Partial<
  Pick<ExternalSourceSettingsFolder, 'attachmentRootPath' | 'excludedDirs' | 'folderPath'>
>;

export function createDraftExternalSourceFolder(folderPath: string): ExternalSourceSettingsFolder {
  const now = new Date().toISOString();
  return {
    attachmentMode: 'document_relative_first_then_fixed_root',
    attachmentRootPath: null,
    createdAt: now,
    documentCount: 0,
    excludedDirs: [],
    folderPath,
    id: crypto.randomUUID(),
    indexedAt: null,
    lastError: null,
    sourceKind: 'folder',
    status: 'idle',
    updatedAt: now
  };
}

export function loadExternalSourceSettingsFolders() {
  return loadRuntimeExternalSearchFolders().then((folders) => folders?.filter((folder) => folder.sourceKind === 'folder') ?? null);
}

export function saveExternalSourceSettingsFolders(folders: ExternalSourceSettingsFolder[]) {
  return saveRuntimeExternalSearchFolders(folders.filter((folder) => folder.sourceKind !== 'readwise_reader'));
}

export function rebuildExternalSourceSettingsIndex(folderId?: string) {
  return rebuildRuntimeExternalSearchIndex(folderId);
}

export function selectExternalSourceSettingsFolderPath() {
  return selectRuntimeFolder();
}
