import type { Dispatch, KeyboardEvent as ReactKeyboardEvent, SetStateAction } from 'react';

import { createNodeListRowKeydownHandler } from '../../features/nodes/components/NodeListTreeKeyboard';
import type { NodeTreeRow as NodeTreeRowModel } from '../../features/nodes/model/nodeTree';
import type {
  RuntimeExternalSearchBrowseEntry,
  RuntimeExternalSearchFolder
} from '../../shared/platform/externalSearchBridge';

import {
  buildExternalLibraryFolderBrowseState,
  resolveExternalFolderLabel,
  type ExternalLibraryDirectoryNode,
  type ExternalLibrarySelection
} from './externalLibraryBrowseModel';
import { compareNaturalName } from './workspaceContentSort';

export interface ExternalTreeRowRecord {
  depth: number;
  hasChildren: boolean;
  id: string;
  isSelected: boolean;
  label: string;
  secondaryIconKind?: 'external-folder';
  secondaryLabel?: string;
  selection: Extract<ExternalLibrarySelection, { folderId: string }>;
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
  selection: ExternalLibrarySelection
): ExternalTreeRowRecord {
  return {
    depth: node.directoryPath.split('/').length,
    hasChildren: node.hasChildren,
    id: buildDirectoryRowId(node.folderId, node.directoryPath),
    isSelected: selection.kind === 'directory' && selection.folderId === node.folderId && selection.directoryPath === node.directoryPath,
    label: node.name,
    selection: {
      directoryPath: node.directoryPath,
      folderId: node.folderId,
      kind: 'directory'
    }
  };
}

function buildFolderTreeRows(
  folder: RuntimeExternalSearchFolder,
  entries: RuntimeExternalSearchBrowseEntry[],
  selection: ExternalLibrarySelection,
  isExternalViewOpen: boolean,
  collapsedIds: Set<string>
) {
  const browseState = buildExternalLibraryFolderBrowseState(folder, entries, { folderId: folder.id, kind: 'folder' });
  const rows: ExternalTreeRowRecord[] = [{
    depth: 0,
    hasChildren: browseState.directoryNodes.length > 0 || (entries.length === 0 && folder.documentCount > 0),
    id: buildFolderRowId(folder.id),
    isSelected:
      isExternalViewOpen &&
      selection.kind !== 'root' &&
      selection.folderId === folder.id &&
      (selection.kind === 'folder' || browseState.selectedDirectoryPath === null),
    label: resolveExternalFolderLabel(folder.folderPath),
    secondaryIconKind: 'external-folder',
    selection: { folderId: folder.id, kind: 'folder' }
  }];
  buildVisibleDirectoryNodes(folder.id, browseState.directoryNodes, collapsedIds).forEach((node) => {
    rows.push(buildDirectoryTreeRow(node, selection));
  });
  return rows;
}

export function buildExternalTreeRows(
  folders: RuntimeExternalSearchFolder[],
  entriesByFolderId: Record<string, RuntimeExternalSearchBrowseEntry[] | undefined>,
  selection: ExternalLibrarySelection,
  isExternalViewOpen: boolean,
  collapsedIds: Set<string>
) {
  return [...folders]
    .sort((left, right) => compareNaturalName(resolveExternalFolderLabel(left.folderPath), resolveExternalFolderLabel(right.folderPath)))
    .flatMap((folder) => buildFolderTreeRows(folder, entriesByFolderId[folder.id] ?? [], selection, isExternalViewOpen, collapsedIds));
}

export function createKeyboardRow(row: ExternalTreeRowRecord): NodeTreeRowModel {
  return {
    depth: row.depth,
    descendantCount: 0,
    hasChildren: row.hasChildren,
    node: {
      anchorLink: null,
      createdAt: '',
      hasContent: false,
      hasReveal: false,
      id: row.id,
      kind: 'folder',
      parentNodeId: null,
      reading: null,
      review: null,
      specialKind: undefined,
      title: row.label,
      updatedAt: ''
    }
  };
}

export function openRowSelection(
  rowId: string,
  rows: ExternalTreeRowRecord[],
  onOpenExternalSelection: (selection: ExternalLibrarySelection) => void
) {
  const row = rows.find((candidate) => candidate.id === rowId);
  if (row) onOpenExternalSelection(row.selection);
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
