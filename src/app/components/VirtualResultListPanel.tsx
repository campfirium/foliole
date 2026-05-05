import { useMemo, useState } from 'react';

import { getNodeListRowSpacing } from '../../features/nodes/components/nodeListRowSpacingSettings';
import { NodeListSearchOverlay, renderSearchLauncher } from '../../features/nodes/components/NodeListSearchOverlay';
import { TrashListRows } from '../../features/nodes/components/TrashListRows';
import {
  buildFlatNodeRows,
  filterNodeTreeRowsByTitle
} from '../../features/nodes/model/nodeTree';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { AppEmptyState, ToolbarActionGroup } from '../../shared/ui';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useWorkspaceContentSort } from '../hooks/useWorkspaceContentSort';

import { normalizeWorkspaceContentSort, sortWorkspaceContentRows } from './workspaceContentSort';
import { WorkspaceContentSortControls } from './WorkspaceContentSortControls';

interface VirtualResultListPanelProps {
  activeNodeId: string | null;
  emptyState: {
    description: string;
    title: string;
  };
  nodes: Node[];
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
}

function useVirtualResultRows(
  nodes: Node[],
  nodesById: Record<string, Node>,
  searchQuery: string,
  sort: ReturnType<typeof useWorkspaceContentSort>['sort'],
  nodeViewById: ReturnType<typeof useWorkspaceStore.getState>['nodeViewById']
) {
  const normalizedSort = normalizeWorkspaceContentSort(sort, ['importedAt', 'lastOpenedAt', 'name']);
  return useMemo(() => {
    const rows = buildFlatNodeRows(nodes.map((node) => node.id), nodesById as WorkspaceListNodesById);
    const sortedRows = sortWorkspaceContentRows(rows, normalizedSort, nodeViewById);
    return searchQuery.trim() ? filterNodeTreeRowsByTitle(sortedRows, searchQuery) : sortedRows;
  }, [nodeViewById, nodes, nodesById, normalizedSort, searchQuery]);
}

export function VirtualResultListPanel(props: VirtualResultListPanelProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const contentSort = useWorkspaceContentSort();
  const nodeViewById = useWorkspaceStore((state) => state.nodeViewById);
  const normalizedSort = normalizeWorkspaceContentSort(contentSort.sort, ['importedAt', 'lastOpenedAt', 'name']);
  const rowSpacing = getNodeListRowSpacing();
  const rows = useVirtualResultRows(props.nodes, props.nodesById, searchQuery, contentSort.sort, nodeViewById);
  const selectedNodeIds = props.activeNodeId && rows.some((row) => row.node.id === props.activeNodeId) ? [props.activeNodeId] : [];

  return (
    <aside aria-label="Current folder contents" className="workspace-region-main-topic flex min-h-0 min-w-0 flex-1 flex-col text-foreground">
      <div className="relative flex min-h-[var(--workspace-top-toolbar-height)] items-center justify-between px-4">
        {renderSearchLauncher(() => setIsSearchOpen(true))}
        <ToolbarActionGroup ariaLabel="Virtual result actions">
          <WorkspaceContentSortControls
            onChangeSortDirection={contentSort.setSortDirection}
            onChangeSortKey={contentSort.setSortKey}
            options={[
              { key: 'importedAt', label: 'Import time' },
              { key: 'lastOpenedAt', label: 'Last opened' },
              { key: 'name', label: 'Name' }
            ]}
            sortDirection={normalizedSort.direction}
            sortKey={normalizedSort.key}
          />
        </ToolbarActionGroup>
        {isSearchOpen ? (
          <NodeListSearchOverlay
            onChangeSearchQuery={setSearchQuery}
            onClose={() => {
              setSearchQuery('');
              setIsSearchOpen(false);
            }}
            searchQuery={searchQuery}
          />
        ) : null}
      </div>
      <div className="app-scrollbar workspace-region-main-topic min-h-0 flex-1 overflow-y-auto px-4 py-2">
        {rows.length === 0 ? (
          <div className="flex min-h-full items-center justify-center py-6">
            <AppEmptyState description={props.emptyState.description} title={props.emptyState.title} />
          </div>
        ) : (
          <div aria-label="Virtual results" className="flex flex-col gap-2" role="tree">
            <TrashListRows
              activeNodeId={selectedNodeIds[0] ?? null}
              nodesById={props.nodesById as WorkspaceListNodesById}
              onContextMenu={() => undefined}
              onKeyDown={() => undefined}
              onSelect={(nodeId) => props.onSelectNode(nodeId)}
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
