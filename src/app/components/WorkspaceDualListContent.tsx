import { useMemo } from 'react';

import { NodeListTree } from '../../features/nodes/components/NodeListTree';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { useDualListResizer } from '../hooks/useDualListResizer';

import { WorkspaceDualListSplitter } from './WorkspaceDualListSplitter';
import { WorkspaceFolderContentsList } from './WorkspaceFolderContentsList';
import {
  buildFolderNavigationNodeOrder,
  buildFolderNavigationNodesById,
  collectFolderColumnNodeIds,
  resolveActiveFolderColumnNodeId,
  resolveFocusedFolderNodeId
} from './workspaceFolderNavigation';
import type { WorkspaceLayoutProps } from './WorkspaceLayout';

interface WorkspaceDualListContentProps {
  activeNodeId: string | null;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  listNodesById: WorkspaceListNodesById;
  nodeOrder: string[];
  onOpenMoveToNode: WorkspaceLayoutProps['onOpenMoveToNode'];
  onOpenNotesView: WorkspaceLayoutProps['onOpenNotesView'];
  onSelectNode: (nodeId: string) => void;
  onSelectTrashNode: WorkspaceLayoutProps['onSelectTrashNode'];
  selectedTrashNodeId: string | null;
  trashedNodeIds: string[];
}

function useWorkspaceDualListState(args: WorkspaceDualListContentProps) {
  return useMemo(() => {
    if (args.isTrashViewOpen || args.isVirtualViewOpen) {
      return null;
    }

    const activeFolderId = resolveFocusedFolderNodeId(
      args.activeNodeId,
      args.nodeOrder,
      args.listNodesById,
      args.trashedNodeIds
    );
    const activeFolderColumnId = resolveActiveFolderColumnNodeId(
      args.activeNodeId,
      args.nodeOrder,
      args.listNodesById,
      args.trashedNodeIds
    );

    return {
      activeFolderColumnId,
      activeFolderId,
      folderItemIds: collectFolderColumnNodeIds(
        activeFolderColumnId,
        args.nodeOrder,
        args.listNodesById,
        args.trashedNodeIds
      ),
      folderNodeOrder: buildFolderNavigationNodeOrder(
        args.nodeOrder,
        args.listNodesById,
        args.trashedNodeIds
      ),
      folderNodesById: buildFolderNavigationNodesById(
        args.nodeOrder,
        args.listNodesById,
        args.trashedNodeIds
      )
    };
  }, [args]);
}

export function WorkspaceDualListContent(props: WorkspaceDualListContentProps) {
  const dualListState = useWorkspaceDualListState(props);
  const folderListResize = useDualListResizer();

  if (!dualListState) {
    return (
      <NodeListTree
        activeNodeId={props.activeNodeId}
        isTrashViewOpen={props.isTrashViewOpen}
        isVirtualViewOpen={props.isVirtualViewOpen}
        nodeOrder={props.nodeOrder}
        nodesById={props.listNodesById}
        onOpenMoveToNode={props.onOpenMoveToNode}
        onOpenNotesView={props.onOpenNotesView}
        onSelectNode={props.onSelectNode}
        onSelectTrashNode={props.onSelectTrashNode}
        selectedTrashNodeId={props.selectedTrashNodeId}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-bg-panel">
      <div
        className="flex min-h-0 min-w-0 overflow-hidden bg-bg-panel"
        style={{ flex: `0 0 ${folderListResize.width}px` }}
      >
        <NodeListTree
          activeNodeId={dualListState.activeFolderId}
          isTrashViewOpen={props.isTrashViewOpen}
          isVirtualViewOpen={props.isVirtualViewOpen}
          nodeOrder={dualListState.folderNodeOrder}
          nodesById={dualListState.folderNodesById}
          onOpenMoveToNode={props.onOpenMoveToNode}
          onOpenNotesView={props.onOpenNotesView}
          onSelectNode={props.onSelectNode}
          onSelectTrashNode={props.onSelectTrashNode}
          selectedTrashNodeId={props.selectedTrashNodeId}
        />
      </div>
      <WorkspaceDualListSplitter
        isResizing={folderListResize.isResizing}
        onKeyDown={folderListResize.handleKeyDown}
        onPointerDown={folderListResize.handlePointerDown}
        width={folderListResize.width}
      />
      <WorkspaceFolderContentsList
        activeFolderId={dualListState.activeFolderColumnId}
        activeNodeId={props.activeNodeId}
        itemIds={dualListState.folderItemIds}
        nodesById={props.listNodesById}
        onSelectNode={props.onSelectNode}
      />
    </div>
  );
}
