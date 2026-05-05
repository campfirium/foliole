import { Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { getNodeListRowSpacing } from '../../features/nodes/components/nodeListRowSpacingSettings';
import { NodeListSearchOverlay, renderSearchLauncher } from '../../features/nodes/components/NodeListSearchOverlay';
import { TrashListRows } from '../../features/nodes/components/TrashListRows';
import { buildFlatNodeRows, filterNodeTreeRowsByTitle } from '../../features/nodes/model/nodeTree';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { AppEmptyState, AppIconButton, AppToolbar, ToolbarActionGroup } from '../../shared/ui';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useWorkspaceContentSort } from '../hooks/useWorkspaceContentSort';

import { normalizeWorkspaceContentSort, sortTrashContentRows } from './workspaceContentSort';
import { WorkspaceContentSortControls } from './WorkspaceContentSortControls';

interface TrashResultListPanelProps {
  nodeOrder: string[];
  nodesById: WorkspaceListNodesById;
  onSelectTrashNode: (nodeId: string) => void;
  selectedTrashNodeId: string | null;
  trashedNodeIds: string[];
}

function useTrashRows(props: TrashResultListPanelProps, searchQuery: string) {
  const contentSort = useWorkspaceContentSort();
  const deletedAtById = useWorkspaceStore((state) => state.trashedNodeDeletedAtById);
  const normalizedSort = normalizeWorkspaceContentSort(contentSort.sort, ['deletedAt', 'name']);
  const rows = useMemo(() => {
    const trashRows = buildFlatNodeRows(
      props.nodeOrder.filter((nodeId) => props.trashedNodeIds.includes(nodeId)),
      props.nodesById
    );
    const sortedRows = sortTrashContentRows(trashRows, normalizedSort, deletedAtById);
    return searchQuery.trim() ? filterNodeTreeRowsByTitle(sortedRows, searchQuery) : sortedRows;
  }, [deletedAtById, normalizedSort, props.nodeOrder, props.nodesById, props.trashedNodeIds, searchQuery]);

  return { contentSort, normalizedSort, rows };
}

export function TrashResultListPanel(props: TrashResultListPanelProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const rowSpacing = getNodeListRowSpacing();
  const { contentSort, normalizedSort, rows } = useTrashRows(props, searchQuery);
  const selectedNodeIds = props.selectedTrashNodeId && rows.some((row) => row.node.id === props.selectedTrashNodeId)
    ? [props.selectedTrashNodeId]
    : [];

  return (
    <aside aria-label="Topic list panel" className="workspace-region-main-topic flex min-h-0 min-w-0 flex-1 flex-col text-foreground">
      <TrashResultHeader
        contentSort={contentSort}
        isSearchOpen={isSearchOpen}
        onCloseSearch={() => {
          setSearchQuery('');
          setIsSearchOpen(false);
        }}
        onOpenSearch={() => setIsSearchOpen(true)}
        onSearchQueryChange={setSearchQuery}
        normalizedSort={normalizedSort}
        searchQuery={searchQuery}
        trashedNodeIds={props.trashedNodeIds}
      />
      <div className="app-scrollbar workspace-region-main-topic min-h-0 flex-1 overflow-y-auto px-4 py-2">
        {rows.length === 0 ? (
          <div className="flex min-h-full items-center justify-center py-6">
            <AppEmptyState description="Deleted topics will appear here." title="Trash is empty" />
          </div>
        ) : (
          <div aria-label="Trash section" className="flex flex-col gap-2" role="tree">
            <TrashListRows
              activeNodeId={selectedNodeIds[0] ?? null}
              nodesById={props.nodesById}
              onContextMenu={() => undefined}
              onKeyDown={() => undefined}
              onSelect={(nodeId) => props.onSelectTrashNode(nodeId)}
              rows={rows}
              rowSpacing={rowSpacing}
              selectedNodeIds={selectedNodeIds}
            />
          </div>
        )}
      </div>
    </aside>
  );
}

function TrashResultHeader(props: {
  contentSort: ReturnType<typeof useWorkspaceContentSort>;
  isSearchOpen: boolean;
  onCloseSearch: () => void;
  onOpenSearch: () => void;
  onSearchQueryChange: (value: string) => void;
  normalizedSort: ReturnType<typeof normalizeWorkspaceContentSort>;
  searchQuery: string;
  trashedNodeIds: string[];
}) {
  const deleteNodesPermanently = useWorkspaceStore((state) => state.deleteNodesPermanently);
  return (
    <AppToolbar as="header" className="relative min-h-[var(--workspace-top-toolbar-height)] justify-between gap-3 px-4">
      {renderSearchLauncher(props.onOpenSearch)}
      <ToolbarActionGroup ariaLabel="Trash actions">
        <WorkspaceContentSortControls
          onChangeSortDirection={props.contentSort.setSortDirection}
          onChangeSortKey={props.contentSort.setSortKey}
          options={[
            { key: 'deletedAt', label: 'Deleted time' },
            { key: 'name', label: 'Name' }
          ]}
          sortDirection={props.normalizedSort.direction}
          sortKey={props.normalizedSort.key}
        />
        <AppIconButton
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
          disabled={props.trashedNodeIds.length === 0}
          icon={<Trash2 size={16} strokeWidth={1.9} />}
          label="Empty trash"
          onClick={() => deleteNodesPermanently(props.trashedNodeIds)}
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
