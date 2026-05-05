import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { getNodeListRowSpacing } from '../../features/nodes/components/nodeListRowSpacingSettings';
import { createNodeListRowKeydownHandler } from '../../features/nodes/components/NodeListTreeKeyboard';
import { NodeTreeRow } from '../../features/nodes/components/NodeTreeRow';
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
import {
  loadExternalCollapsedRowIds,
  saveExternalCollapsedRowIds
} from './externalLibraryCollapseSettings';
import { ExternalLibrarySetupRow } from './ExternalLibrarySetupRow';

interface ExternalLibrarySectionProps {
  entriesByFolderId: Record<string, RuntimeExternalSearchBrowseEntry[] | undefined>;
  folders: RuntimeExternalSearchFolder[];
  isExternalViewOpen: boolean;
  onOpenExternalSelection: (selection: ExternalLibrarySelection) => void;
  onOpenExternalLibrarySettings?: () => void;
  selection: ExternalLibrarySelection;
}

interface ExternalTreeRowRecord {
  depth: number;
  hasChildren: boolean;
  id: string;
  isSelected: boolean;
  label: string;
  secondaryLabel?: string;
  selection: Extract<ExternalLibrarySelection, { folderId: string }>;
}

function toggleCollapsed(nextId: string, setCollapsedIds: React.Dispatch<React.SetStateAction<Set<string>>>) {
  setCollapsedIds((current) => {
    const next = new Set(current);
    if (next.has(nextId)) {
      next.delete(nextId);
    } else {
      next.add(nextId);
    }
    return next;
  });
}

export function ExternalLibrarySection(props: ExternalLibrarySectionProps) {
  const rowSpacing = getNodeListRowSpacing();
  const [collapsedIds, setCollapsedIds] = useExternalCollapsedIds(props.folders);
  const rows = useExternalTreeRows(props, collapsedIds);
  const onRowKeyDown = useExternalRowKeyDown(collapsedIds, rows, props.onOpenExternalSelection, setCollapsedIds);

  return (
    <div className="mt-1 flex min-w-0 flex-col">
      <div aria-hidden="true" className="mx-4 border-t border-border/15" />
      {props.folders.length === 0 ? (
        <ExternalLibrarySetupRow
          isSelected={props.isExternalViewOpen && props.selection.kind === 'root'}
          onOpenSettings={props.onOpenExternalLibrarySettings ?? (() => undefined)}
        />
      ) : (
        <section aria-label="External folder tree" className="flex flex-col pb-2 pt-1" role="tree">
          {rows.map((row) => (
            <NodeTreeRow
              depth={row.depth}
              hasChildren={row.hasChildren}
              isActive={row.isSelected}
              isCollapsed={collapsedIds.has(row.id)}
              isSelected={row.isSelected}
              key={row.id}
              label={row.label}
              nodeId={row.id}
              rowSpacing={rowSpacing}
              secondaryLabel={row.secondaryLabel}
              showIcon={false}
              onKeyDown={(nodeId, event) => handleExternalRowKeyDown(nodeId, event, onRowKeyDown)}
              onSelect={(nodeId) => openRowSelection(nodeId, rows, props.onOpenExternalSelection)}
              onToggleCollapse={(nodeId) => toggleCollapsed(nodeId, setCollapsedIds)}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function useExternalCollapsedIds(folders: RuntimeExternalSearchFolder[]) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => loadInitialCollapsedIds(folders));
  const previousFolderIdsRef = useRef<string[]>(folders.map((folder) => folder.id));

  useEffect(() => {
    saveExternalCollapsedRowIds([...collapsedIds]);
  }, [collapsedIds]);

  useEffect(() => {
    const previousFolderIds = new Set(previousFolderIdsRef.current);
    const nextFolderIds = folders.map((folder) => folder.id);
    const newlyAddedRootIds = nextFolderIds.filter((folderId) => !previousFolderIds.has(folderId));
    previousFolderIdsRef.current = nextFolderIds;
    if (newlyAddedRootIds.length === 0) {
      return;
    }
    setCollapsedIds((current) => {
      const next = new Set(current);
      newlyAddedRootIds.forEach((folderId) => next.add(buildFolderRowId(folderId)));
      return next;
    });
  }, [folders]);

  return [collapsedIds, setCollapsedIds] as const;
}

function useExternalTreeRows(
  props: ExternalLibrarySectionProps,
  collapsedIds: Set<string>
) {
  return useMemo(
    () => buildExternalTreeRows(props.folders, props.entriesByFolderId, props.selection, props.isExternalViewOpen, collapsedIds),
    [collapsedIds, props.entriesByFolderId, props.folders, props.isExternalViewOpen, props.selection]
  );
}

function useExternalRowKeyDown(
  collapsedIds: Set<string>,
  rows: ExternalTreeRowRecord[],
  onOpenExternalSelection: (selection: ExternalLibrarySelection) => void,
  setCollapsedIds: React.Dispatch<React.SetStateAction<Set<string>>>
) {
  const keyboardRows = useMemo(() => rows.map(createKeyboardRow), [rows]);

  return useMemo(
    () =>
      createNodeListRowKeydownHandler({
        collapsedNodeIds: collapsedIds,
        onSelect: (rowId) => openRowSelection(rowId, rows, onOpenExternalSelection),
        onToggleCollapse: (rowId) => toggleCollapsed(rowId, setCollapsedIds),
        rows: keyboardRows
      }),
    [collapsedIds, keyboardRows, onOpenExternalSelection, rows, setCollapsedIds]
  );
}

function buildVisibleDirectoryNodes(
  folderId: string,
  nodes: ExternalLibraryDirectoryNode[],
  collapsedIds: Set<string>
) {
  return nodes.filter((node) => {
    if (collapsedIds.has(buildFolderRowId(folderId))) {
      return false;
    }
    let currentParent = node.parentDirectoryPath;
    while (currentParent) {
      if (collapsedIds.has(buildDirectoryRowId(folderId, currentParent))) {
        return false;
      }
      currentParent = nodes.find((candidate) => candidate.directoryPath === currentParent)?.parentDirectoryPath ?? null;
    }
    return true;
  });
}

function buildExternalTreeRows(
  folders: RuntimeExternalSearchFolder[],
  entriesByFolderId: Record<string, RuntimeExternalSearchBrowseEntry[] | undefined>,
  selection: ExternalLibrarySelection,
  isExternalViewOpen: boolean,
  collapsedIds: Set<string>
) {
  return folders.flatMap((folder) => buildFolderTreeRows(folder, entriesByFolderId[folder.id] ?? [], selection, isExternalViewOpen, collapsedIds));
}

function buildFolderTreeRows(
  folder: RuntimeExternalSearchFolder,
  entries: RuntimeExternalSearchBrowseEntry[],
  selection: ExternalLibrarySelection,
  isExternalViewOpen: boolean,
  collapsedIds: Set<string>
) {
  const browseState = buildExternalLibraryFolderBrowseState(folder, entries, { folderId: folder.id, kind: 'folder' });
  const rows: ExternalTreeRowRecord[] = [
    {
      depth: 0,
      hasChildren: browseState.directoryNodes.length > 0 || (entries.length === 0 && folder.documentCount > 0),
      id: buildFolderRowId(folder.id),
      isSelected:
        isExternalViewOpen &&
        selection.kind !== 'root' &&
        selection.folderId === folder.id &&
        (selection.kind === 'folder' || browseState.selectedDirectoryPath === null),
      label: `${resolveExternalFolderLabel(folder.folderPath)} *`,
      selection: { folderId: folder.id, kind: 'folder' }
    }
  ];
  buildVisibleDirectoryNodes(folder.id, browseState.directoryNodes, collapsedIds).forEach((node) => {
    rows.push(buildDirectoryTreeRow(node, selection));
  });
  return rows;
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

function buildDirectoryRowId(folderId: string, directoryPath: string) {
  return `${folderId}:${directoryPath}`;
}

function buildFolderRowId(folderId: string) {
  return folderId;
}

function loadInitialCollapsedIds(folders: RuntimeExternalSearchFolder[]) {
  const storedRowIds = loadExternalCollapsedRowIds();
  if (storedRowIds !== null) {
    return new Set(storedRowIds);
  }
  return new Set(folders.map((folder) => buildFolderRowId(folder.id)));
}

function createKeyboardRow(row: ExternalTreeRowRecord): NodeTreeRowModel {
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

function openRowSelection(
  rowId: string,
  rows: ExternalTreeRowRecord[],
  onOpenExternalSelection: (selection: ExternalLibrarySelection) => void
) {
  const row = rows.find((candidate) => candidate.id === rowId);
  if (row) {
    onOpenExternalSelection(row.selection);
  }
}

function handleExternalRowKeyDown(
  nodeId: string,
  event: ReactKeyboardEvent<HTMLButtonElement>,
  onRowKeyDown: (nodeId: string, event: ReactKeyboardEvent<HTMLButtonElement>) => void
) {
  onRowKeyDown(nodeId, event);
}
