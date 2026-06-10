import { useCallback, useMemo, useState, type Dispatch, type MouseEvent as ReactMouseEvent, type RefObject, type SetStateAction } from 'react';

import { NodeListStateSurface } from '../../features/nodes/components/NodeListStateSurface';
import { type NodeListContextMenuController } from '../../features/nodes/components/NodeListTreeHooks';
import { useNodeSelectionHandler } from '../../features/nodes/components/NodeListTreeState';
import { buildNodeTree, buildVisibleNodeTreeRows } from '../../features/nodes/model/nodeTree';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { definedProps } from '../../shared/lib/definedProps';

import type { WorkspaceTopicTreeDragController } from './workspaceTopicTreeDrag';
import { WorkspaceTopicTreeRows } from './WorkspaceTopicTreeRows';
import type { WorkspaceTopicTreeScrollPlacement } from './WorkspaceTopicTreeRows';

export function renderWorkspaceTopicTreeBody(args: {
  activeNodeId: string | null;
  collapsedNodeIds: ReadonlySet<string>;
  contextMenu: NodeListContextMenuController;
  drag: WorkspaceTopicTreeDragController;
  isManualSort: boolean;
  nodesById: WorkspaceListNodesById;
  onRenameNode: (nodeId: string, title: string) => void;
  onSelectNode: ReturnType<typeof useNodeSelectionHandler>;
  onToggleCollapse: (nodeId: string) => void;
  scrollPlacement?: WorkspaceTopicTreeScrollPlacement;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  scrollTargetNodeId?: string | null;
  selectedNodeIds: string[];
  visibleRows: ReturnType<typeof buildVisibleNodeTreeRows>;
}) {
  return (
    <div
      className="app-scrollbar workspace-region-main-topic min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2 pt-2"
      ref={args.scrollContainerRef as RefObject<HTMLDivElement>}
      onContextMenu={(event: ReactMouseEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('[role="treeitem"]')) {
          return;
        }
        args.contextMenu.openRootContextMenu(event);
      }}
    >
      <NodeListStateSurface
        className="flex min-h-full items-center justify-center px-3 py-6"
        hasRows={args.visibleRows.length > 0}
      >
        <WorkspaceTopicTreeRows
          activeNodeId={args.activeNodeId}
          collapsedNodeIds={args.collapsedNodeIds}
          drag={args.drag}
          isManualSort={args.isManualSort}
          nodesById={args.nodesById}
          onContextMenu={args.contextMenu.openContextMenu}
          onRenameNode={args.onRenameNode}
          onSelectNode={args.onSelectNode}
          onToggleCollapse={args.onToggleCollapse}
          rows={args.visibleRows}
          scrollContainerRef={args.scrollContainerRef}
          selectedNodeIds={args.selectedNodeIds}
          {...definedProps({ scrollPlacement: args.scrollPlacement, scrollTargetNodeId: args.scrollTargetNodeId })}
        />
      </NodeListStateSurface>
    </div>
  );
}

export function useWorkspaceTopicTreeCollapse(
  activeFolderId: string,
  activeNodeId: string | null,
  treeRows: ReturnType<typeof buildNodeTree>['rows']
) {
  const collapsibleNodeIds = useMemo(
    () => treeRows.filter((row) => row.hasChildren).map((row) => row.node.id),
    [treeRows]
  );
  const [collapseState, setCollapseState] = useState(() => createInitialCollapseState(
    activeFolderId,
    collapsibleNodeIds
  ));
  const syncedState = syncCollapseState({
    activeFolderId,
    activeNodeId,
    collapsibleNodeIds,
    collapseState
  });

  if (syncedState !== collapseState) {
    setCollapseState(syncedState);
  }

  const setCollapsedNodeIds = useCallback<Dispatch<SetStateAction<Set<string>>>>((value) => {
    setCollapseState((current) => ({
      activeFolderId: current.activeFolderId,
      activeNodeId: current.activeNodeId,
      collapsedNodeIds: typeof value === 'function' ? value(current.collapsedNodeIds) : value
    }));
  }, []);

  return { collapsedNodeIds: syncedState.collapsedNodeIds, setCollapsedNodeIds };
}

interface CollapseState {
  activeFolderId: string;
  activeNodeId: string | null;
  collapsedNodeIds: Set<string>;
}

function createInitialCollapseState(
  activeFolderId: string,
  collapsibleNodeIds: readonly string[]
): CollapseState {
  return {
    activeFolderId,
    activeNodeId: null,
    collapsedNodeIds: new Set(collapsibleNodeIds)
  };
}

function pruneCollapsedNodeIds(current: ReadonlySet<string>, collapsibleNodeIds: readonly string[]) {
  const validNodeIds = new Set(collapsibleNodeIds);
  const next = new Set([...current].filter((nodeId) => validNodeIds.has(nodeId)));
  return next.size === current.size ? current : next;
}

function syncCollapseState(args: {
  activeFolderId: string;
  activeNodeId: string | null;
  collapsibleNodeIds: readonly string[];
  collapseState: CollapseState;
}) {
  if (args.collapseState.activeFolderId !== args.activeFolderId) {
    return {
      ...createInitialCollapseState(args.activeFolderId, args.collapsibleNodeIds),
      activeNodeId: args.activeNodeId
    };
  }
  const pruned = pruneCollapsedNodeIds(args.collapseState.collapsedNodeIds, args.collapsibleNodeIds);
  if (
    args.collapseState.activeNodeId === args.activeNodeId &&
    pruned === args.collapseState.collapsedNodeIds
  ) {
    return args.collapseState;
  }
  return {
    activeFolderId: args.activeFolderId,
    activeNodeId: args.activeNodeId,
    collapsedNodeIds: new Set(pruned)
  };
}

export function toggleCollapsedNode(nodeId: string, setCollapsedNodeIds: Dispatch<SetStateAction<Set<string>>>) {
  setCollapsedNodeIds((current) => {
    const next = new Set(current);
    if (next.has(nodeId)) {
      next.delete(nodeId);
    } else {
      next.add(nodeId);
    }
    return next;
  });
}
