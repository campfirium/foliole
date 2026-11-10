import { useEffect, useMemo, useRef, useState } from 'react';

import { FolderSectionRows, useFolderSectionControl, useFolderSectionStack } from '../../features/nodes/components/FolderSectionStack';
import { getNodeListRowSpacing } from '../../features/nodes/components/nodeListRowSpacingSettings';
import { NodeTreeRow } from '../../features/nodes/components/NodeTreeRow';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type {
  ExternalLibraryBrowseEntry,
  ExternalLibraryFolder
} from '../../shared/platform/externalLibraryBrowseRepository';
import {
  loadExternalLibraryFolderOrder,
  sortExternalLibraryFolders,
  type ExternalLibraryFolderOrderItem
} from '../../shared/platform/externalLibraryFolderOrder';

import {
  ExternalFolderContextMenu,
  openExternalSetupContextMenu,
  type ExternalFolderContextMenuState
} from './ExternalFolderContextMenu';
import { ExternalFolderSetupDialog } from './ExternalFolderSetupDialog';
import type { ExternalLibrarySelection } from './externalLibraryBrowseModel';
import { saveExternalCollapsedRowIds } from './externalLibraryCollapseSettings';
import { ExternalLibraryRow } from './ExternalLibraryRow';
import { useExternalFolderDrag } from './ExternalLibrarySectionDrag';
import {
  buildExternalTreeRows,
  buildFolderRowId,
  createExternalRowKeyDown,
  type ExternalTreeRowRecord
} from './ExternalLibrarySectionModel';
import { ExternalLibrarySetupRow } from './ExternalLibrarySetupRow';

const EXTERNAL_HEADING_ID = 'external-library-heading';

interface ExternalLibrarySectionProps {
  entriesByFolderId: Record<string, ExternalLibraryBrowseEntry[] | undefined>;
  folders: ExternalLibraryFolder[];
  isExternalViewOpen: boolean;
  onChangeExternalFolder?: (folderId: string) => void;
  onOpenExternalSelection: (selection: ExternalLibrarySelection) => void;
  onOpenExternalLibrarySettings?: () => void;
  onRemoveExternalFolder?: (folderId: string) => void;
  onRescanExternalFolder?: (folderId: string) => void;
  selection: ExternalLibrarySelection;
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

function renderExternalHeading(
  stack: ReturnType<typeof useFolderSectionStack>,
  title: string,
  rowSpacing: number,
  collapsed: boolean,
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>
) {
  if (!stack) return [];
  const toggle = () => setCollapsed((value) => !value);
  return [
    <NodeTreeRow key="heading" depth={0} hasChildren isActive={false} isCollapsed={collapsed}
      isSelected={false} label={title} nodeId={EXTERNAL_HEADING_ID}
      rowSpacing={rowSpacing} showIcon={false} showLeafChevronPlaceholder={false}
      onKeyDown={(_id, event) => {
        if (event.key !== (collapsed ? 'ArrowRight' : 'ArrowLeft')) return;
        event.preventDefault();
        toggle();
      }}
      onSelect={toggle} onToggleCollapse={toggle} />
  ];
}

function useExternalSectionCollapse() {
  const [collapsed, setCollapsed] = useState(false);
  useFolderSectionControl(true, collapsed, () => setCollapsed((value) => !value));
  return [collapsed, setCollapsed] as const;
}

export function ExternalLibrarySection(props: ExternalLibrarySectionProps) {
  const t = useTranslation();
  const rowSpacing = getNodeListRowSpacing();
  const stack = useFolderSectionStack();
  const [folderOrder, setFolderOrder] = useState<ExternalLibraryFolderOrderItem[]>(loadExternalLibraryFolderOrder);
  const orderedFolders = useMemo(() => sortExternalLibraryFolders(props.folders, folderOrder), [folderOrder, props.folders]);
  const [collapsedIds, setCollapsedIds] = useExternalCollapsedIds(orderedFolders);
  const [contextMenu, setContextMenu] = useState<ExternalFolderContextMenuState | null>(null);
  const [isSetupDialogOpen, setIsSetupDialogOpen] = useState(false);
  const [sectionCollapsed, setSectionCollapsed] = useExternalSectionCollapse();
  const rows = useExternalTreeRows({ ...props, folders: orderedFolders }, collapsedIds, Boolean(stack));
  const onRowKeyDown = useExternalRowKeyDown(collapsedIds, rows, props.onOpenExternalSelection, setCollapsedIds);
  const drag = useExternalFolderDrag(orderedFolders, setFolderOrder);
  return (
    <div className="mt-1 flex min-w-0 flex-col">
      <section aria-label={t('desktop.externalLibrary.folderTree')} className="flex flex-col pb-2 pt-1" role="tree">
        <FolderSectionRows rows={[
          ...renderExternalHeading(stack, t('desktop.externalLibrary.setupLabel'), rowSpacing, sectionCollapsed, setSectionCollapsed),
          ...(sectionCollapsed ? [] : props.folders.length === 0 ? [
            <ExternalLibrarySetupRow
              key="setup"
              depth={stack ? 1 : 0}
              label={stack ? t('desktop.externalLibrary.menu.connectFolder') : t('desktop.externalLibrary.setupLabel')}
              isSelected={props.isExternalViewOpen && props.selection.kind === 'root'}
              onContextMenu={(event) => openExternalSetupContextMenu(event, setContextMenu)}
              onOpenRoot={() => {
                props.onOpenExternalSelection({ kind: 'root' });
                setIsSetupDialogOpen(true);
              }}
            />
          ] : rows.map((row) => (
            <ExternalLibraryRow
              collapsedIds={collapsedIds}
              drag={drag}
              folderId={getMutableExternalFolderRowId(row, orderedFolders)}
              key={row.id}
              onOpenExternalSelection={props.onOpenExternalSelection}
              onRowKeyDown={onRowKeyDown}
              onToggleCollapse={(nodeId) => toggleCollapsed(nodeId, setCollapsedIds)}
              row={row}
              rows={rows}
              rowSpacing={rowSpacing}
              setContextMenu={setContextMenu}
            />
          )))
        ]} />
      </section>
      <ExternalFolderContextMenu
        menu={contextMenu}
        onClose={() => setContextMenu(null)}
        {...definedExternalFolderMenuActions(props)}
      />
      <ExternalFolderSetupDialog
        open={isSetupDialogOpen}
        onClose={() => setIsSetupDialogOpen(false)}
        {...(props.onOpenExternalLibrarySettings ? { onConnectFolder: props.onOpenExternalLibrarySettings } : {})}
      />
    </div>
  );
}

function definedExternalFolderMenuActions(props: ExternalLibrarySectionProps) {
  return {
    ...(props.onChangeExternalFolder ? { onChangeFolder: props.onChangeExternalFolder } : {}),
    ...(props.onOpenExternalLibrarySettings ? { onConnectFolder: props.onOpenExternalLibrarySettings } : {}),
    ...(props.onRemoveExternalFolder ? { onRemoveFolder: props.onRemoveExternalFolder } : {}),
    ...(props.onRescanExternalFolder ? { onRescanFolder: props.onRescanExternalFolder } : {})
  };
}

function getMutableExternalFolderRowId(row: ExternalTreeRowRecord, folders: ExternalLibraryFolder[]) {
  const folderId = row.selection?.kind === 'folder' ? row.selection.folderId : null;
  if (!folderId || folderId === 'opened-external-documents' || folderId.startsWith('readwise-reader-import-')) {
    return null;
  }
  return folders.some((folder) => folder.id === folderId) ? folderId : null;
}

function useExternalCollapsedIds(folders: ExternalLibraryFolder[]) {
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
  collapsedIds: Set<string>,
  hasHeading: boolean
) {
  return useMemo(() => {
    const rows = buildExternalTreeRows(props.folders, props.entriesByFolderId, props.selection, props.isExternalViewOpen, collapsedIds);
    return hasHeading ? rows.map((row) => ({ ...row, depth: row.depth + 1 })) : rows;
  }, [collapsedIds, hasHeading, props.entriesByFolderId, props.folders, props.isExternalViewOpen, props.selection]);
}

function useExternalRowKeyDown(
  collapsedIds: Set<string>,
  rows: ExternalTreeRowRecord[],
  onOpenExternalSelection: (selection: ExternalLibrarySelection) => void,
  setCollapsedIds: React.Dispatch<React.SetStateAction<Set<string>>>
) {
  return useMemo(
    () =>
      createExternalRowKeyDown({
        collapsedIds,
        onOpenExternalSelection,
        rows,
        setCollapsedIds,
        toggleCollapsed
      }),
    [collapsedIds, onOpenExternalSelection, rows, setCollapsedIds]
  );
}

function loadInitialCollapsedIds(folders: ExternalLibraryFolder[]) {
  return new Set(folders.map((folder) => buildFolderRowId(folder.id)));
}
