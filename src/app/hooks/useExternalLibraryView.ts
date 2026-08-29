import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import {
  loadExternalLibraryBrowseEntries,
  loadExternalLibraryFolders,
  subscribeExternalLibraryFolders,
  type ExternalLibraryBrowseEntry,
  type ExternalLibraryFolder
} from '../../shared/platform/externalLibraryBrowseRepository';
import type { ExternalLibrarySelection } from '../components/externalLibraryBrowseModel';

import {
  changeAndOpenExternalFolder,
  connectAndOpenExternalFolder,
  removeExternalFolder,
  rescanExternalFolder
} from './externalFolderConnection';
import {
  resolveExternalSelectionAfterFoldersChanged,
  retainEntriesForCurrentFolders
} from './externalLibraryFolderState';
import { useExternalLibraryViewHistory, type ExternalLibraryViewTarget } from './externalLibraryViewHistory';
import { useExternalDocumentFileOpenEvents } from './useExternalDocumentFileOpenEvents';

export function useExternalLibraryView(onEnterExternalView: () => void = () => undefined) {
  const [isExternalViewOpen, setIsExternalViewOpen] = useState(false);
  const [selection, setSelection] = useState<ExternalLibrarySelection>({ kind: 'root' });
  const [entriesByFolderId, setEntriesByFolderId] = useExternalFolderEntries(selection);
  const [folders, setFolders] = useExternalFoldersState(setSelection, setEntriesByFolderId);
  usePreloadExternalFolderEntries(folders, entriesByFolderId, setEntriesByFolderId);
  const applyHistoryTarget = (target: ExternalLibraryViewTarget) =>
    applyExternalHistoryTarget(target, onEnterExternalView, setSelection, setIsExternalViewOpen);
  const history = useExternalLibraryViewHistory({ applyTarget: applyHistoryTarget, isExternalViewOpen, selection });
  useExternalDocumentFileOpenEvents({
    folders,
    history,
    retainEntriesForCurrentFolders,
    setEntriesByFolderId,
    setFolders
  });
  const actions = createExternalLibraryActions({ folders, history, selection, setFolders, setIsExternalViewOpen, setSelection });

  return {
    canGoBack: history.canGoBack,
    canGoForward: history.canGoForward,
    entriesByFolderId,
    folders,
    goBack: history.goBack,
    goForward: history.goForward,
    isExternalViewOpen,
    ...actions,
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

function createExternalLibraryActions(args: {
  folders: ExternalLibraryFolder[];
  history: ReturnType<typeof useExternalLibraryViewHistory>;
  selection: ExternalLibrarySelection;
  setFolders: Dispatch<SetStateAction<ExternalLibraryFolder[]>>;
  setIsExternalViewOpen: (value: boolean) => void;
  setSelection: Dispatch<SetStateAction<ExternalLibrarySelection>>;
}) {
  return {
    changeExternalFolder: (folderId: string) => void changeAndOpenExternalFolder({
      currentFolders: args.folders,
      folderId,
      onOpenFolder: (nextFolderId) => args.history.openExternalTarget({ folderId: nextFolderId, kind: 'folder' }),
      setFolders: args.setFolders
    }),
    closeExternalView: () => {
      args.setSelection({ kind: 'root' });
      args.setIsExternalViewOpen(false);
    },
    connectExternalFolder: () => void connectAndOpenExternalFolder({
      currentFolders: args.folders,
      onOpenFolder: (folderId) => args.history.openExternalTarget({ folderId, kind: 'folder' }),
      setFolders: args.setFolders
    }),
    openExternalDocument: (document: { absolutePath: string; folderId: string }) => {
      args.history.openExternalTarget({ absolutePath: document.absolutePath, folderId: document.folderId, kind: 'document' });
    },
    openExternalFolder: (folderId?: string) => {
      args.history.openExternalTarget(folderId ? { folderId, kind: 'folder' } : { kind: 'root' });
    },
    openExternalSelection: (nextSelection: ExternalLibrarySelection) => {
      args.history.openExternalTarget(nextSelection);
    },
    removeExternalFolder: (folderId: string) => void removeExternalFolder(args.folders, folderId).then((nextFolders) => {
      if (!nextFolders) return;
      args.setFolders(nextFolders);
      if (args.selection.kind !== 'root' && args.selection.folderId === folderId) {
        args.setSelection({ kind: 'root' });
        args.setIsExternalViewOpen(false);
      }
    }),
    rescanExternalFolder: (folderId: string) => void rescanExternalFolder(folderId).then((nextFolders) => {
      if (nextFolders) args.setFolders(nextFolders);
    })
  };
}

function applyExternalHistoryTarget(
  target: ExternalLibraryViewTarget,
  onEnterExternalView: () => void,
  setSelection: Dispatch<SetStateAction<ExternalLibrarySelection>>,
  setIsExternalViewOpen: (value: boolean) => void
) {
  if (target.kind === 'notes') {
    setSelection({ kind: 'root' });
    setIsExternalViewOpen(false);
    return;
  }
  onEnterExternalView();
  setSelection(target.selection);
  setIsExternalViewOpen(true);
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
      if (!alive) return;
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
