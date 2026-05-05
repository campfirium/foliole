import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import {
  loadRuntimeExternalSearchBrowseEntries,
  loadRuntimeExternalSearchFolders,
  subscribeRuntimeExternalSearchFolders,
  type RuntimeExternalSearchBrowseEntry,
  type RuntimeExternalSearchFolder
} from '../../shared/platform/externalSearchBridge';
import type { ExternalLibrarySelection } from '../components/externalLibraryBrowseModel';

export function useExternalLibraryView() {
  const [isExternalViewOpen, setIsExternalViewOpen] = useState(false);
  const [selection, setSelection] = useState<ExternalLibrarySelection>({ kind: 'root' });
  const [entriesByFolderId, setEntriesByFolderId] = useExternalFolderEntries(selection);
  const folders = useExternalFoldersState(setSelection, setEntriesByFolderId);
  usePreloadExternalFolderEntries(folders, entriesByFolderId, setEntriesByFolderId);

  return {
    entriesByFolderId,
    folders,
    isExternalViewOpen,
    openExternalDocument: (args: { absolutePath: string; folderId: string }) => {
      setSelection({ absolutePath: args.absolutePath, folderId: args.folderId, kind: 'document' });
      setIsExternalViewOpen(true);
    },
    openExternalFolder: (folderId?: string) => {
      setSelection(folderId ? { folderId, kind: 'folder' } : { kind: 'root' });
      setIsExternalViewOpen(true);
    },
    openExternalSelection: (nextSelection: ExternalLibrarySelection) => {
      setSelection(nextSelection);
      setIsExternalViewOpen(true);
    },
    closeExternalView: () => {
      setSelection({ kind: 'root' });
      setIsExternalViewOpen(false);
    },
    refreshActiveFolderEntries: async (folderId: string) => {
      const result = await loadRuntimeExternalSearchBrowseEntries(folderId);
      if (result === null) {
        return;
      }
      setEntriesByFolderId((current) => ({
        ...current,
        [folderId]: result
      }));
    },
    selection,
    setSelection
  };
}

function usePreloadExternalFolderEntries(
  folders: RuntimeExternalSearchFolder[],
  entriesByFolderId: Record<string, RuntimeExternalSearchBrowseEntry[] | undefined>,
  setEntriesByFolderId: Dispatch<SetStateAction<Record<string, RuntimeExternalSearchBrowseEntry[] | undefined>>>
) {
  useEffect(() => {
    const missingFolderIds = folders
      .map((folder) => folder.id)
      .filter((folderId) => !Object.prototype.hasOwnProperty.call(entriesByFolderId, folderId));
    if (missingFolderIds.length === 0) {
      return;
    }
    let alive = true;
    void Promise.all(
      missingFolderIds.map(async (folderId) => ({
        folderId,
        result: await loadRuntimeExternalSearchBrowseEntries(folderId)
      }))
    ).then((results) => {
      if (!alive) {
        return;
      }
      setEntriesByFolderId((current) => {
        let changed = false;
        const next = { ...current };
        results.forEach(({ folderId, result }) => {
          if (result === null || Object.prototype.hasOwnProperty.call(current, folderId)) {
            return;
          }
          next[folderId] = result;
          changed = true;
        });
        return changed ? next : current;
      });
    });
    return () => {
      alive = false;
    };
  }, [entriesByFolderId, folders, setEntriesByFolderId]);
}

function useExternalFoldersState(
  setSelection: (update: (current: ExternalLibrarySelection) => ExternalLibrarySelection) => void,
  setEntriesByFolderId: Dispatch<SetStateAction<Record<string, RuntimeExternalSearchBrowseEntry[] | undefined>>>
) {
  const [folders, setFolders] = useState<RuntimeExternalSearchFolder[]>([]);

  useEffect(() => {
    let alive = true;
    void loadRuntimeExternalSearchFolders().then((result) => {
      if (!alive || result === null) {
        return;
      }
      setEntriesByFolderId((current) => retainEntriesForCurrentFolders(current, [], result));
      setFolders(result);
      setSelection((current) => {
        if (current.kind === 'root') {
          return current;
        }
        return result.some((folder) => folder.id === current.folderId) ? current : { kind: 'root' };
      });
    });
    return () => {
      alive = false;
    };
  }, [setSelection]);

  useEffect(
    () =>
      subscribeRuntimeExternalSearchFolders((nextFolders) => {
        setEntriesByFolderId((current) => retainEntriesForCurrentFolders(current, folders, nextFolders));
        setFolders(nextFolders);
        setSelection((current) => resolveExternalSelectionAfterFoldersChanged(current, nextFolders));
      }),
    [folders, setEntriesByFolderId, setSelection]
  );

  return folders;
}

function retainEntriesForCurrentFolders(
  current: Record<string, RuntimeExternalSearchBrowseEntry[] | undefined>,
  previousFolders: RuntimeExternalSearchFolder[],
  nextFolders: RuntimeExternalSearchFolder[]
) {
  const previousById = new Map(previousFolders.map((folder) => [folder.id, folder]));
  const next: Record<string, RuntimeExternalSearchBrowseEntry[] | undefined> = {};
  let changed = false;

  nextFolders.forEach((folder) => {
    const cachedEntries = current[folder.id];
    if (cachedEntries === undefined) {
      return;
    }
    const previousFolder = previousById.get(folder.id);
    if (previousFolder && isExternalFolderEntryCacheCurrent(previousFolder, folder)) {
      next[folder.id] = cachedEntries;
    } else {
      changed = true;
    }
  });

  if (Object.keys(current).some((folderId) => !Object.prototype.hasOwnProperty.call(next, folderId))) {
    changed = true;
  }

  return changed ? next : current;
}

function isExternalFolderEntryCacheCurrent(
  previousFolder: RuntimeExternalSearchFolder,
  nextFolder: RuntimeExternalSearchFolder
) {
  return (
    previousFolder.documentCount === nextFolder.documentCount &&
    previousFolder.folderPath === nextFolder.folderPath &&
    previousFolder.indexedAt === nextFolder.indexedAt &&
    previousFolder.status === nextFolder.status
  );
}

function resolveExternalSelectionAfterFoldersChanged(
  current: ExternalLibrarySelection,
  folders: RuntimeExternalSearchFolder[]
): ExternalLibrarySelection {
  if (current.kind === 'root') {
    return current;
  }
  return folders.some((folder) => folder.id === current.folderId) ? current : { kind: 'root' };
}

function useExternalFolderEntries(selection: ExternalLibrarySelection) {
  const [entriesByFolderId, setEntriesByFolderId] = useState<Record<string, RuntimeExternalSearchBrowseEntry[] | undefined>>({});
  const activeFolderId = selection.kind === 'root' ? null : selection.folderId;

  useEffect(() => {
    if (!activeFolderId || Object.prototype.hasOwnProperty.call(entriesByFolderId, activeFolderId)) {
      return;
    }
    let alive = true;
    void loadRuntimeExternalSearchBrowseEntries(activeFolderId).then((result) => {
      if (!alive || result === null) {
        return;
      }
      setEntriesByFolderId((current) => ({
        ...current,
        [activeFolderId]: result
      }));
    });
    return () => {
      alive = false;
    };
  }, [activeFolderId, entriesByFolderId]);

  return [entriesByFolderId, setEntriesByFolderId] as const;
}
