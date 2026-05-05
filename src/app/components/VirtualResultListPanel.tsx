import { useMemo, useState } from 'react';

import { NodeListSearchOverlay, renderSearchLauncher } from '../../features/nodes/components/NodeListSearchOverlay';
import { TrashListRows } from '../../features/nodes/components/TrashListRows';
import {
  buildFlatNodeRows,
  filterNodeTreeRowsByTitle
} from '../../features/nodes/model/nodeTree';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { AppEmptyState } from '../../shared/ui';

interface VirtualResultListPanelProps {
  activeNodeId: string | null;
  emptyState: {
    description: string;
    title: string;
  };
  folderTitle: string;
  nodes: Node[];
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
}

function useVirtualResultRows(nodes: Node[], nodesById: Record<string, Node>, searchQuery: string) {
  return useMemo(() => {
    const rows = buildFlatNodeRows(nodes.map((node) => node.id), nodesById as WorkspaceListNodesById);
    if (!searchQuery.trim()) {
      return rows;
    }
    return filterNodeTreeRowsByTitle(rows, searchQuery);
  }, [nodes, nodesById, searchQuery]);
}

export function VirtualResultListPanel(props: VirtualResultListPanelProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const rows = useVirtualResultRows(props.nodes, props.nodesById, searchQuery);
  const selectedNodeIds = props.activeNodeId && rows.some((row) => row.node.id === props.activeNodeId) ? [props.activeNodeId] : [];

  return (
    <aside aria-label="Current folder contents" className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg-panel text-foreground">
      <div className="relative flex min-h-[var(--workspace-top-toolbar-height)] items-center justify-between px-4">
        {renderSearchLauncher(() => setIsSearchOpen(true))}
        <div className="min-w-0 truncate text-sm font-semibold text-foreground">
          {props.folderTitle} {props.nodes.length}
        </div>
        <span aria-hidden="true" className="size-8" />
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
      <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-2">
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
              selectedNodeIds={selectedNodeIds}
            />
          </div>
        )}
      </div>
    </aside>
  );
}
