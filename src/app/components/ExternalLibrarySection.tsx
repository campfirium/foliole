import { HardDrive } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { getNodeListRowSpacing } from '../../features/nodes/components/nodeListRowSpacingSettings';
import { NodeTreeRow } from '../../features/nodes/components/NodeTreeRow';
import { useExternalFoldersSettings } from '../../features/settings/context/ExternalFoldersSettingsProvider';
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

import type { ExternalLibrarySelection } from './externalLibraryBrowseModel';
import { saveExternalCollapsedRowIds } from './externalLibraryCollapseSettings';
import { useExternalFolderDrag } from './ExternalLibrarySectionDrag';
import {
  buildExternalTreeRows,
  buildFolderRowId,
  createExternalRowKeyDown,
  handleExternalRowKeyDown,
  openRowSelection,
  type ExternalTreeRowRecord
} from './ExternalLibrarySectionModel';
import { ExternalLibrarySetupRow } from './ExternalLibrarySetupRow';

interface ExternalLibrarySectionProps {
  entriesByFolderId: Record<string, ExternalLibraryBrowseEntry[] | undefined>;
  folders: ExternalLibraryFolder[];
  isExternalViewOpen: boolean;
  onOpenExternalSelection: (selection: ExternalLibrarySelection) => void;
  onOpenExternalLibrarySettings?: () => void;
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

export function ExternalLibrarySection(props: ExternalLibrarySectionProps) {
  const t = useTranslation();
  const { externalFoldersEnabled } = useExternalFoldersSettings();
  const rowSpacing = getNodeListRowSpacing();
  const [folderOrder, setFolderOrder] = useState<ExternalLibraryFolderOrderItem[]>(loadExternalLibraryFolderOrder);
  const orderedFolders = useMemo(() => sortExternalLibraryFolders(props.folders, folderOrder), [folderOrder, props.folders]);
  const [collapsedIds, setCollapsedIds] = useExternalCollapsedIds(orderedFolders);
  const rows = useExternalTreeRows({ ...props, folders: orderedFolders }, collapsedIds);
  const onRowKeyDown = useExternalRowKeyDown(collapsedIds, rows, props.onOpenExternalSelection, setCollapsedIds);
  const drag = useExternalFolderDrag(orderedFolders, setFolderOrder);

  if (!externalFoldersEnabled) {
    return null;
  }

  return (
    <div className="mt-1 flex min-w-0 flex-col">
      <div aria-hidden="true" className="mx-4 border-t border-border/15" />
      {props.folders.length === 0 ? (
        <ExternalLibrarySetupRow
          isSelected={props.isExternalViewOpen && props.selection.kind === 'root'}
          onOpenSettings={props.onOpenExternalLibrarySettings ?? (() => undefined)}
        />
      ) : (
        <section aria-label={t('desktop.externalLibrary.folderTree')} className="flex flex-col pb-2 pt-1" role="tree">
          {rows.map((row) => (
            <NodeTreeRow
              depth={row.depth}
              hasChildren={row.hasChildren}
              isActive={row.isSelected}
              isCollapsed={collapsedIds.has(row.id)}
              isDragDisabled={row.secondaryIconKind !== 'external-folder'}
              isDropTarget={drag.state?.targetId === row.id}
              isSelected={row.isSelected}
              descendantCount={row.documentCount ?? 0}
              key={row.id}
              label={row.label}
              nodeId={row.id}
              dragDisabledLabel={null}
              dropIntent={drag.state?.targetId === row.id ? drag.state.dropIntent : null}
              rowSpacing={rowSpacing}
              secondaryLabel={row.secondaryLabel}
              showIcon={false}
              trailingLabelContent={renderExternalTrailingLabelContent(row, t('desktop.externalLibrary.folderIcon'))}
              onDragEnd={drag.onDragEnd}
              onDragOver={drag.onDragOver}
              onDragStart={drag.onDragStart}
              onDrop={drag.onDrop}
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

function renderExternalTrailingLabelContent(row: ExternalTreeRowRecord, label: string) {
  if (row.secondaryIconKind !== 'external-folder') {
    return null;
  }
  return (
    <span aria-label={label} className="inline-flex size-3.5 items-center justify-center align-middle text-foreground/45">
      <HardDrive aria-hidden="true" className="-translate-y-[1px]" size={14} strokeWidth={1.7} />
    </span>
  );
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
