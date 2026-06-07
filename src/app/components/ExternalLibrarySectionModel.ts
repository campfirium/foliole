import type { Dispatch, KeyboardEvent as ReactKeyboardEvent, SetStateAction } from 'react';

import { createNodeListRowKeydownHandler, type TreeKeyboardRow } from '../../features/nodes/components/NodeListTreeKeyboard';
import type {
  ExternalLibraryBrowseEntry,
  ExternalLibraryFolder
} from '../../shared/platform/externalLibraryBrowseRepository';

import {
  buildExternalLibraryFolderBrowseState,
  isReadwiseExternalFolder,
  resolveExternalFolderDisplayLabel,
  resolveReadwiseExternalChildLabel,
  type ExternalLibraryDirectoryNode,
  type ExternalLibrarySelection
} from './externalLibraryBrowseModel';

const READWISE_GROUP_ROW_ID = 'external-library-readwise-group';
const RECENT_EXTERNAL_FOLDER_ID = 'opened-external-documents';

export interface ExternalTreeRowRecord {
  depth: number;
  hasChildren: boolean;
  id: string;
  isSelected: boolean;
  label: string;
  documentCount?: number;
  secondaryIconKind?: 'external-folder' | 'recent';
  secondaryLabel?: string;
  selection: Extract<ExternalLibrarySelection, { folderId: string }> | null;
}

function buildDirectoryRowId(folderId: string, directoryPath: string) {
  return `${folderId}:${directoryPath}`;
}

export function buildFolderRowId(folderId: string) {
  return folderId;
}

function buildVisibleDirectoryNodes(
  folderId: string,
  nodes: ExternalLibraryDirectoryNode[],
  collapsedIds: Set<string>
) {
  return nodes.filter((node) => {
    if (collapsedIds.has(buildFolderRowId(folderId))) return false;
    let currentParent = node.parentDirectoryPath;
    while (currentParent) {
      if (collapsedIds.has(buildDirectoryRowId(folderId, currentParent))) return false;
      currentParent = nodes.find((candidate) => candidate.directoryPath === currentParent)?.parentDirectoryPath ?? null;
    }
    return true;
  });
}

function buildDirectoryTreeRow(
  node: ExternalLibraryDirectoryNode,
  nodes: ExternalLibraryDirectoryNode[],
  depthOffset: number,
  selection: ExternalLibrarySelection
): ExternalTreeRowRecord {
  return {
    depth: resolveVisibleDirectoryDepth(node, nodes) + depthOffset,
    hasChildren: node.hasChildren,
    id: buildDirectoryRowId(node.folderId, node.directoryPath),
    isSelected: selection.kind === 'directory' && selection.folderId === node.folderId && selection.directoryPath === node.directoryPath,
    label: node.name,
    documentCount: node.documentCount,
    selection: {
      directoryPath: node.directoryPath,
      folderId: node.folderId,
      kind: 'directory'
    }
  };
}

function resolveVisibleDirectoryDepth(node: ExternalLibraryDirectoryNode, nodes: ExternalLibraryDirectoryNode[]) {
  let depth = 1;
  let parentDirectoryPath = node.parentDirectoryPath;
  while (parentDirectoryPath) {
    depth += 1;
    parentDirectoryPath = nodes.find((candidate) => candidate.directoryPath === parentDirectoryPath)?.parentDirectoryPath ?? null;
  }
  return depth;
}

function buildFolderTreeRows(
  folder: ExternalLibraryFolder,
  entries: ExternalLibraryBrowseEntry[],
  selection: ExternalLibrarySelection,
  isExternalViewOpen: boolean,
  collapsedIds: Set<string>,
  options: { depth: number; label: string }
) {
  const browseState = buildExternalLibraryFolderBrowseState(folder, entries, { folderId: folder.id, kind: 'folder' });
  const rows: ExternalTreeRowRecord[] = [{
    depth: options.depth,
    hasChildren: browseState.directoryNodes.length > 0 || (entries.length === 0 && folder.documentCount > 0),
    id: buildFolderRowId(folder.id),
    isSelected:
      isExternalViewOpen &&
      selection.kind !== 'root' &&
      selection.folderId === folder.id &&
      (selection.kind === 'folder' || browseState.selectedDirectoryPath === null),
    label: options.label,
    documentCount: folder.documentCount,
    secondaryIconKind: folder.id === RECENT_EXTERNAL_FOLDER_ID ? 'recent' : 'external-folder',
    selection: { folderId: folder.id, kind: 'folder' }
  }];
  const visibleDirectoryNodes = buildVisibleDirectoryNodes(folder.id, browseState.directoryNodes, collapsedIds);
  visibleDirectoryNodes.forEach((node) => {
    rows.push(buildDirectoryTreeRow(node, visibleDirectoryNodes, options.depth, selection));
  });
  return rows;
}

function buildReadwiseGroupRows(
  folders: ExternalLibraryFolder[],
  entriesByFolderId: Record<string, ExternalLibraryBrowseEntry[] | undefined>,
  selection: ExternalLibrarySelection,
  isExternalViewOpen: boolean,
  collapsedIds: Set<string>
) {
  if (folders.length === 0) {
    return [];
  }
  const rows: ExternalTreeRowRecord[] = [{
    depth: 0,
    hasChildren: true,
    id: READWISE_GROUP_ROW_ID,
    isSelected: false,
    label: 'Readwise',
    documentCount: folders.reduce((total, folder) => total + folder.documentCount, 0),
    selection: null
  }];
  if (collapsedIds.has(READWISE_GROUP_ROW_ID)) {
    return rows;
  }
  return [
    ...rows,
    ...folders.flatMap((folder) =>
      buildFolderTreeRows(folder, entriesByFolderId[folder.id] ?? [], selection, isExternalViewOpen, collapsedIds, {
        depth: 1,
        label: resolveReadwiseExternalChildLabel(folder)
      })
    )
  ];
}

export function buildExternalTreeRows(
  folders: ExternalLibraryFolder[],
  entriesByFolderId: Record<string, ExternalLibraryBrowseEntry[] | undefined>,
  selection: ExternalLibrarySelection,
  isExternalViewOpen: boolean,
  collapsedIds: Set<string>
) {
  const readwiseFolders = folders.filter(isReadwiseExternalFolder);
  const recentFolders = folders.filter((folder) => folder.id === RECENT_EXTERNAL_FOLDER_ID);
  const regularFolders = folders.filter((folder) => !isReadwiseExternalFolder(folder) && folder.id !== RECENT_EXTERNAL_FOLDER_ID);
  return [
    ...recentFolders.flatMap((folder) =>
      buildFolderTreeRows(folder, entriesByFolderId[folder.id] ?? [], selection, isExternalViewOpen, collapsedIds, {
        depth: 0,
        label: resolveExternalFolderDisplayLabel(folder)
      })
    ),
    ...regularFolders.flatMap((folder) =>
      buildFolderTreeRows(folder, entriesByFolderId[folder.id] ?? [], selection, isExternalViewOpen, collapsedIds, {
        depth: 0,
        label: resolveExternalFolderDisplayLabel(folder)
      })
    ),
    ...buildReadwiseGroupRows(readwiseFolders, entriesByFolderId, selection, isExternalViewOpen, collapsedIds)
  ];
}

export function createKeyboardRow(row: ExternalTreeRowRecord): TreeKeyboardRow {
  return {
    depth: row.depth,
    hasChildren: row.hasChildren,
    id: row.id
  };
}

export function openRowSelection(
  rowId: string,
  rows: ExternalTreeRowRecord[],
  onOpenExternalSelection: (selection: ExternalLibrarySelection) => void
) {
  const row = rows.find((candidate) => candidate.id === rowId);
  if (row?.selection) onOpenExternalSelection(row.selection);
}

export function createExternalRowKeyDown(args: {
  collapsedIds: Set<string>;
  onOpenExternalSelection: (selection: ExternalLibrarySelection) => void;
  rows: ExternalTreeRowRecord[];
  setCollapsedIds: Dispatch<SetStateAction<Set<string>>>;
  toggleCollapsed: (nextId: string, setCollapsedIds: Dispatch<SetStateAction<Set<string>>>) => void;
}) {
  return createNodeListRowKeydownHandler({
    collapsedNodeIds: args.collapsedIds,
    onSelect: (rowId) => openRowSelection(rowId, args.rows, args.onOpenExternalSelection),
    onToggleCollapse: (rowId) => args.toggleCollapsed(rowId, args.setCollapsedIds),
    rows: args.rows.map(createKeyboardRow)
  });
}

export function handleExternalRowKeyDown(
  nodeId: string,
  event: ReactKeyboardEvent<HTMLButtonElement>,
  onRowKeyDown: (nodeId: string, event: ReactKeyboardEvent<HTMLButtonElement>) => void
) {
  onRowKeyDown(nodeId, event);
}
