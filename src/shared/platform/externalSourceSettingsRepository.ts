import { getExternalFolderRuntimeProvider } from './externalFolderRuntime';
import { isManagedExternalLibraryFolder } from './externalLibraryBrowseModel';
import {
  loadRuntimeExternalSearchFolders,
  rebuildRuntimeExternalSearchIndex,
  saveRuntimeExternalSearchFolders,
  setRuntimeExternalSearchFolderEnabled,
  type RuntimeExternalSearchFolder
} from './externalSearchRuntimeRepository';
import { selectRuntimeFolder } from './folderSelectionRuntimeRepository';

export type ExternalSourceSettingsFolder = RuntimeExternalSearchFolder;

export type ExternalSourceSettingsFolderPatch = Partial<
  Pick<ExternalSourceSettingsFolder, 'attachmentRootPath' | 'excludedDirs' | 'folderPath'>
>;

let externalSourceSettingsFoldersCache: ExternalSourceSettingsFolder[] | null | undefined;
let externalSourceSettingsFoldersLoadPromise: Promise<ExternalSourceSettingsFolder[] | null> | null = null;

function configuredExternalFolders(folders: ExternalSourceSettingsFolder[] | null) {
  return folders?.filter((folder) => !isManagedExternalLibraryFolder(folder)) ?? null;
}

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
    const configuredFolders = configuredExternalFolders(folders);
    externalSourceSettingsFoldersCache = configuredFolders;
    return configuredFolders;
  }).finally(() => {
    externalSourceSettingsFoldersLoadPromise = null;
  });
  return externalSourceSettingsFoldersLoadPromise;
}

export function saveExternalSourceSettingsFolders(folders: ExternalSourceSettingsFolder[]) {
  return getExternalFolderRuntimeProvider().saveFolders(folders).then((providerSaved) =>
    providerSaved ?? saveRuntimeExternalSearchFolders(folders)
  ).then((saved) => {
    const configuredFolders = configuredExternalFolders(saved);
    externalSourceSettingsFoldersCache = configuredFolders;
    return configuredFolders;
  });
}

export function setExternalSourceSettingsFolderEnabled(folderId: string, enabled: boolean) {
  return setRuntimeExternalSearchFolderEnabled(folderId, enabled).then((folders) => {
    const configuredFolders = configuredExternalFolders(folders);
    externalSourceSettingsFoldersCache = configuredFolders;
    return configuredFolders;
  });
}

export async function setExternalSourceSettingsFoldersEnabled(folderIds: string[], enabled: boolean) {
  let folders = externalSourceSettingsFoldersCache ?? null;
  for (const folderId of folderIds) {
    try {
      const next = await setExternalSourceSettingsFolderEnabled(folderId, enabled);
      if (next) folders = next;
    } catch (error) {
      return { error, folders };
    }
  }
  return { error: null, folders };
}

export function rebuildExternalSourceSettingsIndex(folderId?: string) {
  return getExternalFolderRuntimeProvider().rebuildIndex(folderId).then((providerFolders) =>
    providerFolders ?? rebuildRuntimeExternalSearchIndex(folderId)
  ).then((folders) => {
    const configuredFolders = configuredExternalFolders(folders);
    externalSourceSettingsFoldersCache = configuredFolders;
    return configuredFolders;
  });
}

export function selectExternalSourceSettingsFolderPath() {
  return getExternalFolderRuntimeProvider().selectFolderPath().then((path) => path ?? selectRuntimeFolder());
}
