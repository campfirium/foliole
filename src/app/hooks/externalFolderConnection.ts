import type { ExternalLibraryFolder } from '../../shared/platform/externalLibraryBrowseRepository';
import {
  createDraftExternalSourceFolder,
  rebuildExternalSourceSettingsIndex,
  saveExternalSourceSettingsFolders,
  selectExternalSourceSettingsFolderPath
} from '../../shared/platform/externalSourceSettingsRepository';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';

export interface ExternalFolderConnectionResult {
  folderId: string;
  folders: ExternalLibraryFolder[];
}

function findConnectedFolder(folders: ExternalLibraryFolder[], draft: ExternalLibraryFolder) {
  return folders.find((folder) => folder.id === draft.id)
    ?? folders.find((folder) => folder.folderPath === draft.folderPath)
    ?? draft;
}

export async function connectExternalFolder(currentFolders: ExternalLibraryFolder[]): Promise<ExternalFolderConnectionResult | null> {
  const selectedPath = await selectExternalSourceSettingsFolderPath();
  if (!selectedPath) {
    return null;
  }

  const existing = currentFolders.find((folder) => folder.folderPath === selectedPath);
  if (existing) {
    return { folderId: existing.id, folders: currentFolders };
  }

  const draft = createDraftExternalSourceFolder(selectedPath);
  const saved = await saveExternalSourceSettingsFolders([...currentFolders, draft]);
  const rebuilt = await rebuildExternalSourceSettingsIndex(draft.id);
  const nextFolders = rebuilt ?? saved ?? [...currentFolders, draft];
  const connected = findConnectedFolder(nextFolders, draft);
  return { folderId: connected.id, folders: nextFolders };
}

export async function changeExternalFolder(currentFolders: ExternalLibraryFolder[], folderId: string) {
  const selectedPath = await selectExternalSourceSettingsFolderPath();
  if (!selectedPath) return null;
  const nextDraftFolders = currentFolders.map((folder) =>
    folder.id === folderId ? { ...folder, folderPath: selectedPath, updatedAt: new Date().toISOString() } : folder
  );
  const saved = await saveExternalSourceSettingsFolders(nextDraftFolders);
  const rebuilt = await rebuildExternalSourceSettingsIndex(folderId);
  return rebuilt ?? saved ?? nextDraftFolders;
}

export async function rescanExternalFolder(folderId: string) {
  return rebuildExternalSourceSettingsIndex(folderId);
}

export async function removeExternalFolder(currentFolders: ExternalLibraryFolder[], folderId: string) {
  return saveExternalSourceSettingsFolders(currentFolders.filter((folder) => folder.id !== folderId));
}

export function getExternalFolderConnectionErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Could not choose folder.';
}

export async function connectAndOpenExternalFolder(args: {
  currentFolders: ExternalLibraryFolder[];
  onOpenFolder: (folderId: string) => void;
  setFolders: (folders: ExternalLibraryFolder[]) => void;
}) {
  try {
    const result = await connectExternalFolder(args.currentFolders);
    if (!result) return;
    args.setFolders(result.folders);
    args.onOpenFolder(result.folderId);
  } catch (error) {
    showAppRuntimeNotice(getExternalFolderConnectionErrorMessage(error), 'error');
  }
}

export async function changeAndOpenExternalFolder(args: {
  currentFolders: ExternalLibraryFolder[];
  folderId: string;
  onOpenFolder: (folderId: string) => void;
  setFolders: (folders: ExternalLibraryFolder[]) => void;
}) {
  try {
    const folders = await changeExternalFolder(args.currentFolders, args.folderId);
    if (!folders) return;
    args.setFolders(folders);
    args.onOpenFolder(args.folderId);
  } catch (error) {
    showAppRuntimeNotice(getExternalFolderConnectionErrorMessage(error), 'error');
  }
}
