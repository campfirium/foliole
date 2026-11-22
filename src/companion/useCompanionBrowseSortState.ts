import { useMemo, useState } from 'react';

import { HOME_NODE_ID, TRASH_NODE_ID, VIRTUAL_ROOT_NODE_ID } from '../../lib/core/database/specialNodeIds';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { externalFolderListSortId } from '../../lib/platform/folderListSortMemoryContract';
import {
  DEFAULT_FOLDER_LIST_SORT_DIRECTION,
  DEFAULT_FOLDER_LIST_SORT_KEY,
  resolveDefaultFolderListSortDirection,
  type FolderListSortDirection,
  type FolderListSortKey
} from '../features/nodes/model/folderListOrdering';
import {
  readCompanionFolderListSort,
  rememberCompanionFolderListSort,
  useCompanionFolderListSortMemory
} from '../shared/platform/companion/settings/companionFolderListSortMemoryStore';
import {
  resolveCompanionFolderViewByNodeId,
  resolveCompanionTrashFolderViewByNodeId
} from '../shared/platform/companionBrowseLists';

import type { CompanionDirectorySelection } from './CompanionDirectoryModel';
import { useCompanionNavigationField, useHasCompanionNavigation } from './CompanionNavigationProvider';

const DEFAULT_SORT = { direction: DEFAULT_FOLDER_LIST_SORT_DIRECTION, key: DEFAULT_FOLDER_LIST_SORT_KEY };

/** The Browse list on screen, as the id its sort is kept under; null when no list is shown (an external document). */
export function resolveCompanionBrowseSortListId(args: {
  browseReturnNodeId: string | null;
  directorySelection: CompanionDirectorySelection;
  isBrowseDirectoryOpen: boolean;
  isListNode(nodeId: string): boolean;
  selectedBrowseNodeId: string | null;
}): string | null {
  if (!args.isBrowseDirectoryOpen) {
    const selected = args.selectedBrowseNodeId;
    if (selected && args.isListNode(selected)) return selected;
    // A topic being read keeps the order of the list it was opened from.
    return selected ? args.browseReturnNodeId ?? HOME_NODE_ID : HOME_NODE_ID;
  }
  const selection = args.directorySelection;
  switch (selection.kind) {
    case 'root': return VIRTUAL_ROOT_NODE_ID;
    case 'trash': return TRASH_NODE_ID;
    case 'internal':
    case 'virtual':
    case 'trashFolder': return selection.nodeId;
    case 'externalFolder': return externalFolderListSortId(selection.folderId);
    case 'externalDirectory': return externalFolderListSortId(selection.folderId, selection.directoryPath);
    default: return null;
  }
}

function isKnownListId(snapshot: WorkspaceSnapshot | null, listId: string) {
  return !snapshot || listId.startsWith('special-') || listId.startsWith('external:') || Boolean(snapshot.nodesById[listId]);
}

function useRememberedBrowseSort(snapshot: WorkspaceSnapshot | null) {
  useCompanionFolderListSortMemory();
  const [isBrowseDirectoryOpen] = useCompanionNavigationField('isBrowseDirectoryOpen', false);
  const [directorySelection] = useCompanionNavigationField('directorySelection', { kind: 'root' });
  const [selectedBrowseNodeId] = useCompanionNavigationField('selectedBrowseNodeId', null);
  const [browseReturnNodeId] = useCompanionNavigationField('browseReturnNodeId', null);
  const selectedIsList = useMemo(() => Boolean(selectedBrowseNodeId && (
    resolveCompanionFolderViewByNodeId(snapshot, selectedBrowseNodeId) ??
    resolveCompanionTrashFolderViewByNodeId(snapshot, selectedBrowseNodeId))), [selectedBrowseNodeId, snapshot]);
  const listId = resolveCompanionBrowseSortListId({ browseReturnNodeId, directorySelection, isBrowseDirectoryOpen,
    isListNode: () => selectedIsList, selectedBrowseNodeId });
  const read = (id: string | null) => readCompanionFolderListSort(id) ?? DEFAULT_SORT;
  const remember = (id: string | null, choice: typeof DEFAULT_SORT) => {
    if (id) void rememberCompanionFolderListSort(id, choice, DEFAULT_SORT, other => isKnownListId(snapshot, other));
  };
  const shown = read(listId);
  return {
    browseSortDirection: shown.direction,
    browseSortKey: shown.key,
    setBrowseSortDirection: (direction: FolderListSortDirection) => remember(listId, { ...read(listId), direction }),
    setBrowseSortKey: (key: FolderListSortKey) => remember(listId, { direction: resolveDefaultFolderListSortDirection(), key }),
    // The repeated Browse tap only ever switches the home list between its two quick orders.
    toggleHomeQuickSort: () => remember(HOME_NODE_ID, {
      direction: resolveDefaultFolderListSortDirection(),
      key: read(HOME_NODE_ID).key === 'dateLastOpened' ? 'dateSaved' : 'dateLastOpened'
    })
  };
}

/** Without a library database (web preview) the order is kept only for this visit, shared by every list. */
function useVisitBrowseSort() {
  const [sort, setSort] = useState(DEFAULT_SORT);
  return {
    browseSortDirection: sort.direction,
    browseSortKey: sort.key,
    setBrowseSortDirection: (direction: FolderListSortDirection) => setSort(current => ({ ...current, direction })),
    setBrowseSortKey: (key: FolderListSortKey) => setSort({ direction: resolveDefaultFolderListSortDirection(), key }),
    toggleHomeQuickSort: () => setSort(current => ({ direction: resolveDefaultFolderListSortDirection(),
      key: current.key === 'dateLastOpened' ? 'dateSaved' : 'dateLastOpened' }))
  };
}

export function useCompanionBrowseSortState(snapshot: WorkspaceSnapshot | null = null) {
  const remembered = useRememberedBrowseSort(snapshot);
  const visit = useVisitBrowseSort();
  return useHasCompanionNavigation() ? remembered : visit;
}
