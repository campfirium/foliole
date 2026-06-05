import { useEffect, useRef, useState } from 'react';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import {
  createDraftExternalSourceFolder,
  loadExternalSourceSettingsFolders,
  rebuildExternalSourceSettingsIndex,
  saveExternalSourceSettingsFolders,
  selectExternalSourceSettingsFolderPath,
  type ExternalSourceSettingsFolder,
  type ExternalSourceSettingsFolderPatch
} from '../../../shared/platform/externalSourceSettingsRepository';

export function useExternalSearchFolders() {
  const t = useTranslation();
  const [folders, setFolders] = useState<ExternalSourceSettingsFolder[]>([]);
  const [isDesktopRuntime, setIsDesktopRuntime] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const lastSavedSnapshotRef = useRef('[]');

  useLoadExternalSearchFolders(loadKey, setError, setFolders, setIsDesktopRuntime, setIsLoading, lastSavedSnapshotRef, t);
  usePersistExternalSearchFolders(folders, isDesktopRuntime, lastSavedSnapshotRef, setError, setFeedback, setFolders, setIsSaving, t);

  function updateFolder(folderId: string, update: (current: ExternalSourceSettingsFolder) => ExternalSourceSettingsFolder) {
    setFolders((current) => current.map((folder) => (folder.id === folderId ? update(folder) : folder)));
  }

  return {
    externalSearchError: error,
    externalSearchFolders: folders,
    externalSearchFeedback: feedback,
    isDesktopRuntime,
    isLoadingExternalSearchFolders: isLoading,
    isSavingExternalSearchFolders: isSaving,
    onAddExternalSearchFolder: () => void addExternalSearchFolder(setError, setFeedback, setFolders),
    onChooseExternalAttachmentRoot: (folderId: string) => void chooseExternalAttachmentRoot(folderId, updateFolder),
    onChooseExternalSearchFolder: (folderId: string) => void chooseExternalSearchFolder(folderId, updateFolder),
    onRebuildExternalSearchIndex: (folderId?: string) =>
      void rebuildExternalSearchFolders(folderId, setError, setFeedback, setFolders, setIsSaving, t),
    onRemoveExternalSearchFolder: (folderId: string) => setFolders((current) => current.filter((folder) => folder.id !== folderId)),
    onRetryLoadExternalSearchFolders: () => setLoadKey((value) => value + 1),
    onUpdateExternalSearchFolder: (folderId: string, patch: ExternalSourceSettingsFolderPatch) =>
      updateFolder(folderId, (current) => ({
        ...current,
        ...patch
      }))
  };
}

function useLoadExternalSearchFolders(
  loadKey: number,
  setError: (value: string | null) => void,
  setFolders: (value: ExternalSourceSettingsFolder[]) => void,
  setIsDesktopRuntime: (value: boolean) => void,
  setIsLoading: (value: boolean) => void,
  lastSavedSnapshotRef: { current: string },
  t: ReturnType<typeof useTranslation>
) {
  useEffect(() => {
    let alive = true;
    setError(null);
    setIsLoading(true);
    loadExternalSourceSettingsFolders()
      .then((loaded) => {
        if (!alive || loaded === null) return;
        setIsDesktopRuntime(true);
        lastSavedSnapshotRef.current = serializeEditableFolders(loaded);
        setFolders(loaded);
      })
      .catch((nextError) => {
        if (!alive) return;
        setError(nextError instanceof Error ? nextError.message : t('settings.externalSources.error.load'));
      })
      .finally(() => {
        if (alive) {
          setIsLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [lastSavedSnapshotRef, loadKey, setError, setFolders, setIsDesktopRuntime, setIsLoading, t]);
}

function usePersistExternalSearchFolders(
  folders: ExternalSourceSettingsFolder[],
  isDesktopRuntime: boolean,
  lastSavedSnapshotRef: { current: string },
  setError: (value: string | null) => void,
  setFeedback: (value: string | null) => void,
  setFolders: (value: ExternalSourceSettingsFolder[]) => void,
  setIsSaving: (value: boolean) => void,
  t: ReturnType<typeof useTranslation>
) {
  useEffect(() => {
    if (!isDesktopRuntime) return;
    const nextSnapshot = serializeEditableFolders(folders);
    if (nextSnapshot === lastSavedSnapshotRef.current) return;
    const timer = window.setTimeout(() => {
      void persistExternalSearchFolders(
        folders,
        nextSnapshot,
        lastSavedSnapshotRef,
        setError,
        setFeedback,
        setFolders,
        setIsSaving,
        t
      );
    }, 350);
    return () => window.clearTimeout(timer);
  }, [folders, isDesktopRuntime, lastSavedSnapshotRef, setError, setFeedback, setFolders, setIsSaving, t]);
}

async function addExternalSearchFolder(
  setError: (value: string | null) => void,
  setFeedback: (value: string | null) => void,
  setFolders: (value: (current: ExternalSourceSettingsFolder[]) => ExternalSourceSettingsFolder[]) => void
) {
  const selectedPath = await selectExternalSourceSettingsFolderPath();
  if (!selectedPath) return;
  setFolders((current) => [...current, createDraftExternalSourceFolder(selectedPath)]);
  setFeedback(null);
  setError(null);
}

async function chooseExternalAttachmentRoot(
  folderId: string,
  updateFolder: (folderId: string, update: (current: ExternalSourceSettingsFolder) => ExternalSourceSettingsFolder) => void
) {
  const selectedPath = await selectExternalSourceSettingsFolderPath();
  if (!selectedPath) return;
  updateFolder(folderId, (current) => ({ ...current, attachmentRootPath: selectedPath }));
}

async function chooseExternalSearchFolder(
  folderId: string,
  updateFolder: (folderId: string, update: (current: ExternalSourceSettingsFolder) => ExternalSourceSettingsFolder) => void
) {
  const selectedPath = await selectExternalSourceSettingsFolderPath();
  if (!selectedPath) return;
  updateFolder(folderId, (current) => ({ ...current, folderPath: selectedPath }));
}

async function persistExternalSearchFolders(
  folders: ExternalSourceSettingsFolder[],
  nextSnapshot: string,
  lastSavedSnapshotRef: { current: string },
  setError: (value: string | null) => void,
  setFeedback: (value: string | null) => void,
  setFolders: (value: ExternalSourceSettingsFolder[]) => void,
  setIsSaving: (value: boolean) => void,
  t: ReturnType<typeof useTranslation>
) {
  setIsSaving(true);
  setError(null);
  try {
    const saved = await saveExternalSourceSettingsFolders(folders);
    if (saved === null) return;
    const rebuilt = await rebuildExternalSourceSettingsIndex();
    lastSavedSnapshotRef.current = nextSnapshot;
    setFolders(rebuilt ?? saved);
    setFeedback(t('settings.externalSources.feedback.saved'));
  } catch (nextError) {
    setError(nextError instanceof Error ? nextError.message : t('settings.externalSources.error.save'));
  } finally {
    setIsSaving(false);
  }
}

function serializeEditableFolders(folders: ExternalSourceSettingsFolder[]) {
  return JSON.stringify(
    folders.map((folder) => ({
      attachmentMode: 'document_relative_first_then_fixed_root',
      attachmentRootPath: folder.attachmentRootPath?.trim() || null,
      excludedDirs: folder.excludedDirs,
      folderPath: folder.folderPath,
      id: folder.id
    }))
  );
}

async function rebuildExternalSearchFolders(
  folderId: string | undefined,
  setError: (value: string | null) => void,
  setFeedback: (value: string | null) => void,
  setFolders: (value: ExternalSourceSettingsFolder[]) => void,
  setIsSaving: (value: boolean) => void,
  t: ReturnType<typeof useTranslation>
) {
  setIsSaving(true);
  setFeedback(null);
  setError(null);
  try {
    const rebuilt = await rebuildExternalSourceSettingsIndex(folderId);
    if (!rebuilt) return;
    setFolders(rebuilt);
    setFeedback(folderId ? t('settings.externalSources.feedback.folderMirrorUpdated') : t('settings.externalSources.feedback.allMirrorsUpdated'));
  } catch (nextError) {
    setError(nextError instanceof Error ? nextError.message : t('settings.externalSources.error.updateMirror'));
  } finally {
    setIsSaving(false);
  }
}
