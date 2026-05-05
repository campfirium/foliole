import { useEffect, useRef, useState } from 'react';

import {
  loadRuntimeExternalSearchFolders,
  rebuildRuntimeExternalSearchIndex,
  saveRuntimeExternalSearchFolders,
  type RuntimeExternalSearchFolder
} from '../../../shared/platform/externalSearchBridge';
import { selectRuntimeImportDirectory } from '../../../shared/platform/importBridge';

function createDraftFolder(folderPath: string): RuntimeExternalSearchFolder {
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

export function useExternalSearchFolders() {
  const [folders, setFolders] = useState<RuntimeExternalSearchFolder[]>([]);
  const [isDesktopRuntime, setIsDesktopRuntime] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastSavedSnapshotRef = useRef('[]');

  useLoadExternalSearchFolders(setError, setFolders, setIsDesktopRuntime, lastSavedSnapshotRef);
  usePersistExternalSearchFolders(folders, isDesktopRuntime, lastSavedSnapshotRef, setError, setFeedback, setFolders, setIsSaving);

  function updateFolder(folderId: string, update: (current: RuntimeExternalSearchFolder) => RuntimeExternalSearchFolder) {
    setFolders((current) => current.map((folder) => (folder.id === folderId ? update(folder) : folder)));
  }

  return {
    externalSearchError: error,
    externalSearchFolders: folders,
    externalSearchFeedback: feedback,
    isDesktopRuntime,
    isSavingExternalSearchFolders: isSaving,
    onAddExternalSearchFolder: () => void addExternalSearchFolder(setError, setFeedback, setFolders),
    onChooseExternalAttachmentRoot: (folderId: string) => void chooseExternalAttachmentRoot(folderId, updateFolder),
    onChooseExternalSearchFolder: (folderId: string) => void chooseExternalSearchFolder(folderId, updateFolder),
    onRebuildExternalSearchIndex: (folderId?: string) =>
      void rebuildExternalSearchFolders(folderId, setError, setFeedback, setFolders, setIsSaving),
    onRemoveExternalSearchFolder: (folderId: string) => setFolders((current) => current.filter((folder) => folder.id !== folderId)),
    onUpdateExternalSearchFolder: (
      folderId: string,
      patch: Partial<Pick<RuntimeExternalSearchFolder, 'attachmentRootPath' | 'excludedDirs' | 'folderPath'>>
    ) =>
      updateFolder(folderId, (current) => ({
        ...current,
        ...patch
      }))
  };
}

function useLoadExternalSearchFolders(
  setError: (value: string | null) => void,
  setFolders: (value: RuntimeExternalSearchFolder[]) => void,
  setIsDesktopRuntime: (value: boolean) => void,
  lastSavedSnapshotRef: { current: string }
) {
  useEffect(() => {
    let alive = true;
    loadRuntimeExternalSearchFolders()
      .then((loaded) => {
        if (!alive || loaded === null) return;
        setIsDesktopRuntime(true);
        lastSavedSnapshotRef.current = serializeEditableFolders(loaded);
        setFolders(loaded);
      })
      .catch((nextError) => {
        if (!alive) return;
        setError(nextError instanceof Error ? nextError.message : 'Could not load the external library.');
      });
    return () => {
      alive = false;
    };
  }, [lastSavedSnapshotRef, setError, setFolders, setIsDesktopRuntime]);
}

function usePersistExternalSearchFolders(
  folders: RuntimeExternalSearchFolder[],
  isDesktopRuntime: boolean,
  lastSavedSnapshotRef: { current: string },
  setError: (value: string | null) => void,
  setFeedback: (value: string | null) => void,
  setFolders: (value: RuntimeExternalSearchFolder[]) => void,
  setIsSaving: (value: boolean) => void
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
        setIsSaving
      );
    }, 350);
    return () => window.clearTimeout(timer);
  }, [folders, isDesktopRuntime, lastSavedSnapshotRef, setError, setFeedback, setFolders, setIsSaving]);
}

async function addExternalSearchFolder(
  setError: (value: string | null) => void,
  setFeedback: (value: string | null) => void,
  setFolders: (value: (current: RuntimeExternalSearchFolder[]) => RuntimeExternalSearchFolder[]) => void
) {
  const selectedPath = await selectRuntimeImportDirectory();
  if (!selectedPath) return;
  setFolders((current) => [...current, createDraftFolder(selectedPath)]);
  setFeedback(null);
  setError(null);
}

async function chooseExternalAttachmentRoot(
  folderId: string,
  updateFolder: (folderId: string, update: (current: RuntimeExternalSearchFolder) => RuntimeExternalSearchFolder) => void
) {
  const selectedPath = await selectRuntimeImportDirectory();
  if (!selectedPath) return;
  updateFolder(folderId, (current) => ({ ...current, attachmentRootPath: selectedPath }));
}

async function chooseExternalSearchFolder(
  folderId: string,
  updateFolder: (folderId: string, update: (current: RuntimeExternalSearchFolder) => RuntimeExternalSearchFolder) => void
) {
  const selectedPath = await selectRuntimeImportDirectory();
  if (!selectedPath) return;
  updateFolder(folderId, (current) => ({ ...current, folderPath: selectedPath }));
}

async function persistExternalSearchFolders(
  folders: RuntimeExternalSearchFolder[],
  nextSnapshot: string,
  lastSavedSnapshotRef: { current: string },
  setError: (value: string | null) => void,
  setFeedback: (value: string | null) => void,
  setFolders: (value: RuntimeExternalSearchFolder[]) => void,
  setIsSaving: (value: boolean) => void
) {
  setIsSaving(true);
  setError(null);
  try {
    const saved = await saveRuntimeExternalSearchFolders(folders);
    if (saved === null) return;
    lastSavedSnapshotRef.current = nextSnapshot;
    setFolders(saved);
    setFeedback('External library settings saved.');
  } catch (nextError) {
    setError(nextError instanceof Error ? nextError.message : 'Could not save external library settings.');
  } finally {
    setIsSaving(false);
  }
}

function serializeEditableFolders(folders: RuntimeExternalSearchFolder[]) {
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
  setFolders: (value: RuntimeExternalSearchFolder[]) => void,
  setIsSaving: (value: boolean) => void
) {
  setIsSaving(true);
  setFeedback(null);
  setError(null);
  try {
    const rebuilt = await rebuildRuntimeExternalSearchIndex(folderId);
    if (!rebuilt) return;
    setFolders(rebuilt);
    setFeedback(folderId ? 'Folder index rebuilt.' : 'All external library indexes rebuilt.');
  } catch (nextError) {
    setError(nextError instanceof Error ? nextError.message : 'Could not rebuild the external library index.');
  } finally {
    setIsSaving(false);
  }
}
