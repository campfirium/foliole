import { ChevronsDownUp, ChevronsUpDown, RefreshCw } from 'lucide-react';
import { useMemo, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';

import { getNodeListRowSpacing } from '../../features/nodes/components/nodeListRowSpacingSettings';
import { NodeListSearchOverlay, renderSearchLauncher } from '../../features/nodes/components/NodeListSearchOverlay';
import { createNodeListRowKeydownHandler } from '../../features/nodes/components/NodeListTreeKeyboard';
import { NodeTreeRow } from '../../features/nodes/components/NodeTreeRow';
import { resolveNodeTreeRowIconKind } from '../../features/nodes/components/NodeTreeRowIconModel';
import type { NodeTreeRow as RemovedTreeRow } from '../../features/nodes/model/nodeTree';
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
  isSearchOpen: boolean;
  loadEntries: () => Promise<void>;
  onChangeSortDirection: (sortDirection: WorkspaceContentSortDirection) => void;
  onChangeSortKey: (sortKey: WorkspaceContentSortKey) => void;
  onCloseSearch: () => void;
  onOpenSearch: () => void;
  onSearchQueryChange: (value: string) => void;
  onToggleCollapseAll: () => void;
  searchQuery: string;
  sortDirection: WorkspaceContentSortDirection;
  sortKey: WorkspaceContentSortKey;
}) {
  return (
    <AppToolbar as="header" className="relative min-h-[var(--workspace-top-toolbar-height)] justify-between gap-3 px-4">
      {renderSearchLauncher(props.onOpenSearch)}
      <span aria-hidden="true" className="min-w-0 flex-1" />
      <ToolbarActionGroup ariaLabel="Removed actions">
        <WorkspaceContentSortControls
          onChangeSortDirection={props.onChangeSortDirection}
          onChangeSortKey={props.onChangeSortKey}
          options={[
            { key: 'deletedAt', label: 'Date removed' },
            { key: 'name', label: 'Name' }
          ]}
          sortDirection={props.sortDirection}
          sortKey={props.sortKey}
        />
        <AppIconButton
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
          disabled={!props.hasCollapsibleNodes}
          icon={props.hasCollapsedNodes ? <ChevronsDownUp size={16} strokeWidth={1.9} /> : <ChevronsUpDown size={16} strokeWidth={1.9} />}
          label={props.hasCollapsedNodes ? 'Expand all topics' : 'Collapse all topics'}
          onClick={props.onToggleCollapseAll}
        />
        <AppIconButton
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
          icon={<RefreshCw size={15} strokeWidth={1.9} />}
          label="Refresh Removed"
          onClick={props.loadEntries}
        />
      </ToolbarActionGroup>
      {props.isSearchOpen ? (
        <NodeListSearchOverlay
          onChangeSearchQuery={props.onSearchQueryChange}
          onClose={props.onCloseSearch}
          searchQuery={props.searchQuery}
        />
      ) : null}
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
          description="Removed keep or Readwise topics will appear here while their source still exists."
          title="No removed topics"
        />
      </div>
    );
  }
  return (
    <div aria-label="Removed topics" className="flex flex-col gap-2" role="tree">
      {props.rows.map((row) => renderRemovedSourceRow(row, { ...props, onRowKeyDown, rowSpacing }))}
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
      trailingLabelContent={entry?.hasSourceUpdate ? <span className="text-xs text-foreground/55">Updated</span> : null}
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
        <AppDropdownMenuItem onSelect={() => props.onImport(props.entry!)}>Import to Foliole</AppDropdownMenuItem>
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}
