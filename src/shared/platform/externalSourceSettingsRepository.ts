import { getExternalFolderRuntimeProvider } from './externalFolderRuntime';
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

let externalSourceSettingsFoldersCache: ExternalSourceSettingsFolder[] | null | undefined;
let externalSourceSettingsFoldersLoadPromise: Promise<ExternalSourceSettingsFolder[] | null> | null = null;

export function resetExternalSourceSettingsFoldersCacheForTest() {
  externalSourceSettingsFoldersCache = undefined;
  externalSourceSettingsFoldersLoadPromise = null;
}

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
    status: 'idle',
    updatedAt: now
  };
}

export function loadExternalSourceSettingsFolders() {
  if (externalSourceSettingsFoldersCache !== undefined) {
    return Promise.resolve(externalSourceSettingsFoldersCache);
  }
  if (externalSourceSettingsFoldersLoadPromise) {
    return externalSourceSettingsFoldersLoadPromise;
  }
  externalSourceSettingsFoldersLoadPromise = getExternalFolderRuntimeProvider().loadFolders().then((providerFolders) =>
    providerFolders ?? loadRuntimeExternalSearchFolders()
  ).then((folders) => {
    externalSourceSettingsFoldersCache = folders;
    return folders;
  }).finally(() => {
    externalSourceSettingsFoldersLoadPromise = null;
  });
  return externalSourceSettingsFoldersLoadPromise;
}

export function saveExternalSourceSettingsFolders(folders: ExternalSourceSettingsFolder[]) {
  return getExternalFolderRuntimeProvider().saveFolders(folders).then((providerSaved) =>
    providerSaved ?? saveRuntimeExternalSearchFolders(folders)
  ).then((saved) => {
    externalSourceSettingsFoldersCache = saved;
    return saved;
  });
}

export function rebuildExternalSourceSettingsIndex(folderId?: string) {
  return getExternalFolderRuntimeProvider().rebuildIndex(folderId).then((providerFolders) =>
    providerFolders ?? rebuildRuntimeExternalSearchIndex(folderId)
  ).then((folders) => {
    externalSourceSettingsFoldersCache = folders;
    return folders;
  });
}

export function selectExternalSourceSettingsFolderPath() {
  return getExternalFolderRuntimeProvider().selectFolderPath().then((path) => path ?? selectRuntimeFolder());
}
