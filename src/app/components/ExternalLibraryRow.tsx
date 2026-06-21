import { FileClock, HardDrive } from 'lucide-react';

import { getNodeListRowSpacing } from '../../features/nodes/components/nodeListRowSpacingSettings';
import { NodeTreeRow } from '../../features/nodes/components/NodeTreeRow';
import { useTranslation } from '../../shared/localization/LocalizationProvider';

import {
  openExternalFolderContextMenu,
  type ExternalFolderContextMenuState
} from './ExternalFolderContextMenu';
import type { ExternalLibrarySelection } from './externalLibraryBrowseModel';
import type { useExternalFolderDrag } from './ExternalLibrarySectionDrag';
import {
  createExternalRowKeyDown,
  handleExternalRowKeyDown,
  openRowSelection,
  type ExternalTreeRowRecord
} from './ExternalLibrarySectionModel';

export function ExternalLibraryRow(props: {
  collapsedIds: Set<string>;
  drag: ReturnType<typeof useExternalFolderDrag>;
  folderId: string | null;
  onOpenExternalSelection: (selection: ExternalLibrarySelection) => void;
  onRowKeyDown: ReturnType<typeof createExternalRowKeyDown>;
  onToggleCollapse: (nodeId: string) => void;
  row: ExternalTreeRowRecord;
  rows: ExternalTreeRowRecord[];
  rowSpacing: ReturnType<typeof getNodeListRowSpacing>;
  setContextMenu: (menu: ExternalFolderContextMenuState) => void;
}) {
  const t = useTranslation();
  return (
    <NodeTreeRow
      depth={props.row.depth}
      hasChildren={props.row.hasChildren}
      isActive={props.row.isSelected}
      isCollapsed={props.collapsedIds.has(props.row.id)}
      isDragDisabled={props.row.secondaryIconKind !== 'external-folder'}
      isDropTarget={props.drag.state?.targetId === props.row.id}
      isSelected={props.row.isSelected}
      descendantCount={props.row.documentCount ?? 0}
      label={props.row.label}
      nodeId={props.row.id}
      dragDisabledLabel={null}
      dropIntent={props.drag.state?.targetId === props.row.id ? props.drag.state.dropIntent : null}
      rowSpacing={props.rowSpacing}
      secondaryLabel={props.row.secondaryLabel}
      showIcon={false}
      showLeafChevronPlaceholder={false}
      trailingLabelContent={renderExternalTrailingLabelContent(props.row, t('desktop.externalLibrary.folderIcon'))}
      {...(props.row.labelTooltipText !== undefined ? { labelTooltipText: props.row.labelTooltipText } : {})}
      {...(props.folderId ? {
        onContextMenu: (_nodeId, event) => openExternalFolderContextMenu(event, props.folderId ?? '', props.setContextMenu)
      } : {})}
      onDragEnd={props.drag.onDragEnd}
      onDragOver={props.drag.onDragOver}
      onDragStart={props.drag.onDragStart}
      onDrop={props.drag.onDrop}
      onKeyDown={(nodeId, event) => handleExternalRowKeyDown(nodeId, event, props.onRowKeyDown)}
      onSelect={(nodeId) => openRowSelection(nodeId, props.rows, props.onOpenExternalSelection)}
      onToggleCollapse={props.onToggleCollapse}
    />
  );
}

function renderExternalTrailingLabelContent(row: ExternalTreeRowRecord, label: string) {
  if (!row.secondaryIconKind) {
    return null;
  }
  if (row.secondaryIconKind === 'recent') {
    return (
      <span className="inline-flex size-3.5 items-center justify-center align-middle text-foreground/45" data-external-library-marker="opened">
        <FileClock aria-hidden="true" className="-translate-y-[1px]" size={14} strokeWidth={1.7} />
      </span>
    );
  }
  return (
    <span aria-label={label} className="inline-flex size-3.5 items-center justify-center align-middle text-foreground/45">
      <HardDrive aria-hidden="true" className="-translate-y-[1px]" size={14} strokeWidth={1.7} />
    </span>
  );
}
