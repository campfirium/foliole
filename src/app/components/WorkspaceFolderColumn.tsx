import { NodeListTree } from '../../features/nodes/components/NodeListTree';
import { TRASH_NODE_ID, VIRTUAL_ROOT_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import {
  VIRTUAL_SECTION_HEIGHT_DEFAULT,
  useVirtualSectionResizer
} from '../hooks/useVirtualSectionResizer';

import { WorkspaceVirtualSectionSplitter } from './WorkspaceVirtualSectionSplitter';

interface WorkspaceFolderColumnProps {
  activeFolderId: string | null;
  activeVirtualNodeId?: string | null;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  folderNodeOrder: string[];
  folderNodesById: WorkspaceListNodesById;
  nodeOrder: string[];
  nodesById: WorkspaceListNodesById;
  onOpenMoveToNode: () => void;
  onOpenNotesView: () => void;
  onOpenTrashView: () => void;
  onOpenVirtualView?: (nodeId?: string) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectNodeInVirtualView: (nodeId: string) => void;
  onSelectTrashNode: (nodeId: string) => void;
  selectedTrashNodeId: string | null;
}

function getActiveFolderSelectionId(props: WorkspaceFolderColumnProps) {
  if (props.isVirtualViewOpen) {
    return null;
  }
  return props.isTrashViewOpen ? TRASH_NODE_ID : props.activeFolderId;
}

function getActiveVirtualSelectionId(props: WorkspaceFolderColumnProps) {
  if (!props.isVirtualViewOpen) {
    return null;
  }
  return props.activeVirtualNodeId ?? VIRTUAL_ROOT_NODE_ID;
}

function renderRegularSection(props: WorkspaceFolderColumnProps) {
  return (
    <NodeListTree
      activeNodeId={getActiveFolderSelectionId(props)}
      isSelectionScopeActive={!props.isVirtualViewOpen}
      isTrashViewOpen={false}
      isVirtualViewOpen={false}
      key={props.isVirtualViewOpen ? 'regular-hidden-by-virtual' : props.isTrashViewOpen ? 'regular-trash' : 'regular-notes'}
      nodeOrder={props.folderNodeOrder}
      nodesById={props.folderNodesById}
      onOpenMoveToNode={props.onOpenMoveToNode}
      onOpenNotesView={props.onOpenNotesView}
      onSelectNode={(nodeId) => {
        if (nodeId === TRASH_NODE_ID) {
          props.onOpenTrashView();
          return;
        }
        if (props.isTrashViewOpen || props.isVirtualViewOpen) {
          props.onOpenNotesView();
        }
        props.onSelectNode(nodeId);
      }}
      onSelectTrashNode={props.onSelectTrashNode}
      selectedTrashNodeId={props.selectedTrashNodeId}
      showTitleSearch={false}
    />
  );
}

function renderVirtualSection(props: WorkspaceFolderColumnProps, height: number) {
  return (
    <div className="flex min-h-0 min-w-0 overflow-hidden border-t border-border/60" style={{ flex: `0 0 ${height}px` }}>
      <NodeListTree
        activeNodeId={getActiveVirtualSelectionId(props)}
        isSelectionScopeActive={props.isVirtualViewOpen}
        isTrashViewOpen={false}
        isVirtualViewOpen
        key={props.isVirtualViewOpen ? `virtual-open-${props.activeVirtualNodeId ?? VIRTUAL_ROOT_NODE_ID}` : 'virtual-closed'}
        nodeOrder={props.nodeOrder}
        nodesById={props.nodesById}
        onOpenMoveToNode={props.onOpenMoveToNode}
        onOpenNotesView={props.onOpenNotesView}
        onSelectNode={(nodeId) => {
          props.onOpenVirtualView?.(nodeId);
          props.onSelectNodeInVirtualView(nodeId);
        }}
        onSelectTrashNode={props.onSelectTrashNode}
        selectedTrashNodeId={props.selectedTrashNodeId}
        showVirtualCreateAction={false}
        showTitleSearch={false}
      />
    </div>
  );
}

export function WorkspaceFolderColumn(props: WorkspaceFolderColumnProps) {
  const virtualSectionResize = useVirtualSectionResizer(VIRTUAL_SECTION_HEIGHT_DEFAULT);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg-panel">
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">{renderRegularSection(props)}</div>
      <WorkspaceVirtualSectionSplitter
        height={virtualSectionResize.height}
        isResizing={virtualSectionResize.isResizing}
        onKeyDown={virtualSectionResize.handleKeyDown}
        onPointerDown={virtualSectionResize.handlePointerDown}
      />
      {renderVirtualSection(props, virtualSectionResize.height)}
    </div>
  );
}
