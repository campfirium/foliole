import { ChevronsDownUp, ChevronsUpDown, RefreshCw } from 'lucide-react';
import { useMemo, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';

import { getNodeListRowSpacing } from '../../features/nodes/components/nodeListRowSpacingSettings';
import { createNodeListRowKeydownHandler } from '../../features/nodes/components/NodeListTreeKeyboard';
import { NodeTreeRow } from '../../features/nodes/components/NodeTreeRow';
import { resolveNodeTreeRowIconKind } from '../../features/nodes/components/NodeTreeRowIconModel';
import type { NodeTreeRow as RemovedTreeRow } from '../../features/nodes/model/nodeTree';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { RuntimeRemovedSourceEntry } from '../../shared/platform/removedSourcesRuntimeRepository';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
  AppEmptyState,
  AppIconButton,
  AppToolbar,
  ToolbarActionGroup
} from '../../shared/ui';

import type { WorkspaceContentSortDirection, WorkspaceContentSortKey } from './workspaceContentSort';
import { WorkspaceContentSortControls } from './WorkspaceContentSortControls';

export function RemovedSourcesToolbar(props: {
  hasCollapsibleNodes: boolean;
  hasCollapsedNodes: boolean;
  loadEntries: () => Promise<void>;
  onChangeSortDirection: (sortDirection: WorkspaceContentSortDirection) => void;
  onChangeSortKey: (sortKey: WorkspaceContentSortKey) => void;
  onToggleCollapseAll: () => void;
  sortDirection: WorkspaceContentSortDirection;
  sortKey: WorkspaceContentSortKey;
}) {
  const t = useTranslation();
  return (
    <AppToolbar as="header" className="relative min-h-[var(--workspace-top-toolbar-height)] justify-between gap-3 px-4">
      <p className="min-w-0 flex-1 truncate text-sm leading-6 text-foreground/62">
        {t('desktop.removed.description')}
      </p>
      <ToolbarActionGroup ariaLabel={t('desktop.removed.actions')}>
        <WorkspaceContentSortControls
          onChangeSortDirection={props.onChangeSortDirection}
          onChangeSortKey={props.onChangeSortKey}
          options={[
            { key: 'deletedAt', label: t('desktop.removed.sort.dateRemoved') },
            { key: 'name', label: t('desktop.removed.sort.name') }
          ]}
          sortDirection={props.sortDirection}
          sortKey={props.sortKey}
        />
        <AppIconButton
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
          disabled={!props.hasCollapsibleNodes}
          icon={props.hasCollapsedNodes ? <ChevronsDownUp size={16} strokeWidth={1.9} /> : <ChevronsUpDown size={16} strokeWidth={1.9} />}
          label={props.hasCollapsedNodes ? t('desktop.removed.expandAll') : t('desktop.removed.collapseAll')}
          onClick={props.onToggleCollapseAll}
        />
        <AppIconButton
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
          icon={<RefreshCw size={15} strokeWidth={1.9} />}
          label={t('desktop.removed.refresh')}
          onClick={props.loadEntries}
        />
      </ToolbarActionGroup>
    </AppToolbar>
  );
}

export function RemovedSourceRows(props: {
  collapsedNodeIds: ReadonlySet<string>;
  entryByNodeId: Record<string, RuntimeRemovedSourceEntry | undefined>;
  onOpenContextMenu: (entry: RuntimeRemovedSourceEntry, event: ReactMouseEvent<HTMLElement>) => void;
  rows: RemovedTreeRow[];
  selectedId: string | null;
  onSelect: (entry: RuntimeRemovedSourceEntry) => void;
  onToggleCollapse: (nodeId: string) => void;
}) {
  const t = useTranslation();
  const rowSpacing = getNodeListRowSpacing();
  const onRowKeyDown = useMemo(
    () =>
      createNodeListRowKeydownHandler({
        collapsedNodeIds: props.collapsedNodeIds,
        onSelect: (nodeId) => {
          const entry = props.entryByNodeId[nodeId];
          if (entry) props.onSelect(entry);
        },
        onToggleCollapse: props.onToggleCollapse,
        rows: props.rows
      }),
    [props]
  );
  if (props.rows.length === 0) {
    return (
      <div className="flex min-h-full items-center justify-center py-6">
        <AppEmptyState
          description={t('desktop.removed.empty.description')}
          title={t('desktop.removed.empty.title')}
        />
      </div>
    );
  }
  return (
    <div aria-label={t('desktop.removed.tree')} className="flex flex-col gap-2" role="tree">
      {props.rows.map((row) => renderRemovedSourceRow(row, { ...props, onRowKeyDown, rowSpacing, updatedLabel: t('desktop.removed.updated') }))}
    </div>
  );
}

function renderRemovedSourceRow(
  row: RemovedTreeRow,
  args: {
    collapsedNodeIds: ReadonlySet<string>;
    entryByNodeId: Record<string, RuntimeRemovedSourceEntry | undefined>;
    onOpenContextMenu: (entry: RuntimeRemovedSourceEntry, event: ReactMouseEvent<HTMLElement>) => void;
    onRowKeyDown: (nodeId: string, event: ReactKeyboardEvent<HTMLButtonElement>) => void;
    onSelect: (entry: RuntimeRemovedSourceEntry) => void;
    onToggleCollapse: (nodeId: string) => void;
    rowSpacing: number;
    selectedId: string | null;
    updatedLabel: string;
  }
) {
  const entry = args.entryByNodeId[row.node.id];
  const isSelected = Boolean(entry && args.selectedId === entry.id);
  const isCollapsed = args.collapsedNodeIds.has(row.node.id);
  return (
    <NodeTreeRow
      depth={row.depth}
      descendantCount={row.descendantCount}
      hasChildren={row.hasChildren}
      isActive={isSelected}
      isCollapsed={isCollapsed}
      isDragDisabled
      isSelected={isSelected}
      key={row.node.id}
      label={row.node.title}
      nodeIconKind={resolveNodeTreeRowIconKind({
        hasChildren: row.hasChildren,
        isCollapsed,
        isReviewCard: false,
        kind: row.node.kind ?? 'topic'
      })}
      nodeId={row.node.id}
      onContextMenu={(_, event) => {
        if (entry) args.onOpenContextMenu(entry, event);
      }}
      onKeyDown={args.onRowKeyDown}
      onSelect={(nodeId) => {
        const selectedEntry = args.entryByNodeId[nodeId];
        if (selectedEntry) {
          args.onSelect(selectedEntry);
          return;
        }
        if (row.hasChildren) args.onToggleCollapse(nodeId);
      }}
      onToggleCollapse={args.onToggleCollapse}
      rowSpacing={args.rowSpacing}
      showIcon
      trailingLabelContent={entry?.hasSourceUpdate ? <span className="text-xs text-foreground/55">{args.updatedLabel}</span> : null}
    />
  );
}

export function RemovedSourceContextMenu(props: {
  entry: RuntimeRemovedSourceEntry | null;
  left: number;
  onClose: () => void;
  onImport: (entry: RuntimeRemovedSourceEntry) => void;
  top: number;
}) {
  const t = useTranslation();
  if (!props.entry) {
    return null;
  }
  return (
    <AppDropdownMenu onOpenChange={(open) => (open ? undefined : props.onClose())} open>
      <AppDropdownMenuTrigger asChild>
        <button
          aria-hidden="true"
          className="pointer-events-none fixed h-0 w-0 opacity-0"
          style={{ left: `${props.left}px`, top: `${props.top}px` }}
          type="button"
        />
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent
        align="start"
        onCloseAutoFocus={(event) => event.preventDefault()}
        onContextMenu={(event) => event.preventDefault()}
        sideOffset={0}
      >
        <AppDropdownMenuItem onSelect={() => props.onImport(props.entry!)}>{t('desktop.removed.reimport')}</AppDropdownMenuItem>
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}
