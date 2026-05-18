import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import {
  loadExternalLibraryBrowseEntries,
  loadExternalLibraryFolders,
  subscribeExternalLibraryFolders,
  type ExternalLibraryBrowseEntry,
  type ExternalLibraryFolder
} from '../../shared/platform/externalLibraryBrowseRepository';
import type { ExternalLibrarySelection } from '../components/externalLibraryBrowseModel';

import { useExternalLibraryViewHistory, type ExternalLibraryViewTarget } from './externalLibraryViewHistory';
import { useExternalDocumentFileOpenEvents } from './useExternalDocumentFileOpenEvents';

export function useExternalLibraryView() {
  const [isExternalViewOpen, setIsExternalViewOpen] = useState(false);
  const [selection, setSelection] = useState<ExternalLibrarySelection>({ kind: 'root' });
  const [entriesByFolderId, setEntriesByFolderId] = useExternalFolderEntries(selection);
  const [folders, setFolders] = useExternalFoldersState(setSelection, setEntriesByFolderId);
  usePreloadExternalFolderEntries(folders, entriesByFolderId, setEntriesByFolderId);

  function applyHistoryTarget(target: ExternalLibraryViewTarget) {
    if (target.kind === 'notes') {
      setSelection({ kind: 'root' });
      setIsExternalViewOpen(false);
      return;
    }
    setSelection(target.selection);
    setIsExternalViewOpen(true);
  }
  const history = useExternalLibraryViewHistory({ applyTarget: applyHistoryTarget, isExternalViewOpen, selection });
  useExternalDocumentFileOpenEvents({
    folders,
    history,
    retainEntriesForCurrentFolders,
    setEntriesByFolderId,
    setFolders
  });

  return {
    canGoBack: history.canGoBack,
    canGoForward: history.canGoForward,
    entriesByFolderId,
    folders,
    goBack: history.goBack,
    goForward: history.goForward,
    isExternalViewOpen,
    openExternalDocument: (args: { absolutePath: string; folderId: string }) => {
      history.openExternalTarget({ absolutePath: args.absolutePath, folderId: args.folderId, kind: 'document' });
    },
    openExternalFolder: (folderId?: string) => {
      history.openExternalTarget(folderId ? { folderId, kind: 'folder' } : { kind: 'root' });
    },
    openExternalSelection: (nextSelection: ExternalLibrarySelection) => {
      history.openExternalTarget(nextSelection);
    },
    closeExternalView: () => {
      setSelection({ kind: 'root' });
      setIsExternalViewOpen(false);
    },
    refreshActiveFolderEntries: async (folderId: string) => {
      const result = await loadExternalLibraryBrowseEntries(folderId);
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
  folders: ExternalLibraryFolder[],
  entriesByFolderId: Record<string, ExternalLibraryBrowseEntry[] | undefined>,
  setEntriesByFolderId: Dispatch<SetStateAction<Record<string, ExternalLibraryBrowseEntry[] | undefined>>>
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
        result: await loadExternalLibraryBrowseEntries(folderId)
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
  setEntriesByFolderId: Dispatch<SetStateAction<Record<string, ExternalLibraryBrowseEntry[] | undefined>>>
) {
  const [folders, setFolders] = useState<ExternalLibraryFolder[]>([]);

  useEffect(() => {
    let alive = true;
    void loadExternalLibraryFolders().then((result) => {
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
      subscribeExternalLibraryFolders((nextFolders) => {
        setEntriesByFolderId((current) => retainEntriesForCurrentFolders(current, folders, nextFolders));
        setFolders(nextFolders);
        setSelection((current) => resolveExternalSelectionAfterFoldersChanged(current, nextFolders));
      }),
    [folders, setEntriesByFolderId, setSelection]
  );

  return [folders, setFolders] as const;
}

function retainEntriesForCurrentFolders(
  current: Record<string, ExternalLibraryBrowseEntry[] | undefined>,
  previousFolders: ExternalLibraryFolder[],
  nextFolders: ExternalLibraryFolder[]
) {
  const previousById = new Map(previousFolders.map((folder) => [folder.id, folder]));
  const next: Record<string, ExternalLibraryBrowseEntry[] | undefined> = {};
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
  previousFolder: ExternalLibraryFolder,
  nextFolder: ExternalLibraryFolder
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
  folders: ExternalLibraryFolder[]
): ExternalLibrarySelection {
  if (current.kind === 'root') {
    return current;
  }
  return folders.some((folder) => folder.id === current.folderId) ? current : { kind: 'root' };
}

function useExternalFolderEntries(selection: ExternalLibrarySelection) {
  const [entriesByFolderId, setEntriesByFolderId] = useState<Record<string, ExternalLibraryBrowseEntry[] | undefined>>({});
  const activeFolderId = selection.kind === 'root' ? null : selection.folderId;

  useEffect(() => {
    if (!activeFolderId || Object.prototype.hasOwnProperty.call(entriesByFolderId, activeFolderId)) {
      return;
    }
    let alive = true;
    void loadExternalLibraryBrowseEntries(activeFolderId).then((result) => {
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
