import { Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { getNodeListRowSpacing } from '../../features/nodes/components/nodeListRowSpacingSettings';
import { NodeListStateSurface } from '../../features/nodes/components/NodeListStateSurface';
import { createNodeListRowKeydownHandler } from '../../features/nodes/components/NodeListTreeKeyboard';
import { TrashListRows } from '../../features/nodes/components/TrashListRows';
import { buildFlatNodeRows } from '../../features/nodes/model/nodeTree';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { toWorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { cn } from '../../shared/lib/utils';
import { AppInput, ToolbarActionGroup } from '../../shared/ui';
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
  header:
    | { kind: 'description'; text: string }
    | { kind: 'user-search'; nodeId: string; query: string };
  nodes: Node[];
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
}

const VIRTUAL_RESULT_SORT_OPTIONS = [
  { key: 'modifiedAt' as const, label: 'Date modified' },
  { key: 'lastOpenedAt' as const, label: 'Last opened' },
  { key: 'importedAt' as const, label: 'Date imported' },
  { key: 'name' as const, label: 'Name' }
];

function useVirtualResultRows(
  nodes: Node[],
  nodesById: Record<string, Node>,
  sort: ReturnType<typeof useWorkspaceContentSort>['sort'],
  nodeViewById: ReturnType<typeof useWorkspaceStore.getState>['nodeViewById']
) {
  const normalizedSort = normalizeWorkspaceContentSort(sort, ['modifiedAt', 'lastOpenedAt', 'importedAt', 'name']);
  return useMemo(() => {
    const listNodesById = toWorkspaceListNodesById(nodesById);
    const rows = buildFlatNodeRows(nodes.map((node) => node.id), listNodesById);
    return sortWorkspaceContentRows(rows, normalizedSort, nodeViewById);
  }, [nodeViewById, nodes, nodesById, normalizedSort]);
}

function useVirtualResultKeyboard(
  rows: ReturnType<typeof useVirtualResultRows>,
  onSelectNode: (nodeId: string) => void
) {
  return useMemo(
    () =>
      createNodeListRowKeydownHandler({
        collapsedNodeIds: new Set(),
        onSelect: onSelectNode,
        onToggleCollapse: () => undefined,
        rows
      }),
    [onSelectNode, rows]
  );
}

function VirtualSavedSearchInput(props: { nodeId: string; query: string }) {
  const [draftQuery, setDraftQuery] = useState(props.query);
  const updateVirtualNodeFilter = useWorkspaceStore((state) => state.updateVirtualNodeFilter);

  useEffect(() => {
    setDraftQuery(props.query);
  }, [props.nodeId, props.query]);

  useEffect(() => {
    if (draftQuery === props.query) return;
    const timeout = window.setTimeout(() => updateVirtualNodeFilter(props.nodeId, draftQuery), 300);
    return () => window.clearTimeout(timeout);
  }, [draftQuery, props.nodeId, props.query, updateVirtualNodeFilter]);

  return (
    <label className="relative flex min-w-0 flex-1 items-center">
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 text-foreground/45" size={16} strokeWidth={1.8} />
      <AppInput
        aria-label="Saved search query"
        className="h-9 min-w-0 rounded-full pl-9 text-[14px]"
        onBlur={() => {
          if (draftQuery !== props.query) updateVirtualNodeFilter(props.nodeId, draftQuery);
        }}
        onChange={(event) => setDraftQuery(event.currentTarget.value)}
        placeholder="Search titles and topic text"
        type="search"
        value={draftQuery}
      />
    </label>
  );
}

function renderVirtualHeaderContent(header: VirtualResultListPanelProps['header']) {
  if (header.kind === 'user-search') {
    return <VirtualSavedSearchInput nodeId={header.nodeId} query={header.query} />;
  }
  return (
    <p className="min-w-0 flex-1 truncate text-sm leading-6 text-foreground/62">
      {header.text}
    </p>
  );
}

export function VirtualResultListPanel(props: VirtualResultListPanelProps) {
  const contentSort = useWorkspaceContentSort();
  const nodeViewById = useWorkspaceStore((state) => state.nodeViewById);
  const normalizedSort = normalizeWorkspaceContentSort(contentSort.sort, ['modifiedAt', 'lastOpenedAt', 'importedAt', 'name']);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const rowSpacing = getNodeListRowSpacing();
  const listNodesById = useMemo(() => toWorkspaceListNodesById(props.nodesById), [props.nodesById]);
  const rows = useVirtualResultRows(props.nodes, props.nodesById, contentSort.sort, nodeViewById);
  const selectedNodeIds = props.activeNodeId && rows.some((row) => row.node.id === props.activeNodeId) ? [props.activeNodeId] : [];
  const onRowKeyDown = useVirtualResultKeyboard(rows, props.onSelectNode);

  return (
    <aside aria-label="Current folder contents" className="workspace-region-main-topic flex min-h-0 min-w-0 flex-1 flex-col text-foreground">
      <div className={cn('relative flex min-h-[var(--workspace-top-toolbar-height)] items-center justify-between gap-3 px-4')}>
        {renderVirtualHeaderContent(props.header)}
        <ToolbarActionGroup ariaLabel="Virtual result actions">
          <WorkspaceContentSortControls
            onChangeSortDirection={contentSort.setSortDirection}
            onChangeSortKey={contentSort.setSortKey}
            options={VIRTUAL_RESULT_SORT_OPTIONS}
            sortDirection={normalizedSort.direction}
            sortKey={normalizedSort.key}
          />
        </ToolbarActionGroup>
      </div>
      <div className="app-scrollbar workspace-region-main-topic min-h-0 flex-1 overflow-y-auto px-4 py-2" ref={scrollContainerRef}>
        <NodeListStateSurface
          className="flex min-h-full items-center justify-center py-6"
          emptyState={props.emptyState}
          hasRows={rows.length > 0}
        >
          <div aria-label="Virtual results" className="flex flex-col gap-2" role="tree">
            <TrashListRows
              activeNodeId={selectedNodeIds[0] ?? null}
              nodesById={listNodesById}
              onContextMenu={() => undefined}
              onKeyDown={onRowKeyDown}
              onSelect={(nodeId) => props.onSelectNode(nodeId)}
              rows={rows}
              rowSpacing={rowSpacing}
              scrollContainerRef={scrollContainerRef}
              selectedNodeIds={selectedNodeIds}
            />
          </div>
        </NodeListStateSurface>
      </div>
    </aside>
  );
}
