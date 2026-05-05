import type { ReactNode } from 'react';

import type { ReviewSessionState } from '../../../store/workspaceStore';
import type { NodeTreeRow } from '../model/nodeTree';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

import { NodeListPanel } from './NodeListPanel';
import type {
  NodeListCollapseController,
  NodeListContextMenuController
} from './NodeListTreeHooks';
import { NodeListTreeMenu } from './NodeListTreeMenu';
import type { NodeListState, NodeSelectModifiers } from './NodeListTreeState';
import { useNodeListSearchRows } from './useNodeListSearchRows';

interface NodeListTreeContentProps {
  activeCollapsedNodeIds: ReadonlySet<string>;
  activeNodeId: string | null;
  activeRows: NodeTreeRow[];
  bodyAppendContent?: ReactNode;
  collapse: NodeListCollapseController;
  contextMenu: NodeListContextMenuController;
  createChildNode: (parentNodeId: string, content?: string, kind?: 'folder' | 'topic' | 'item') => string;
  createGlobalNode: (content?: string, kind?: 'folder' | 'topic' | 'item') => string;
  createVirtualNode: () => string;
  deleteNodes: (nodeIds: string[]) => void;
  deleteNodesPermanently: (nodeIds: string[]) => void;
  deleteStatusLabel: string | null;
  dismissNode: (nodeId: string, now?: string) => boolean;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  moveNodes: (
    nodeIds: string[],
    targetNodeId: string | null,
    intent: 'before' | 'after' | 'child' | 'root'
  ) => boolean;
  nodesById: WorkspaceListNodesById;
  onOpenMoveToNode: () => void;
  onOpenNotesView: () => void;
  onSelect: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  restoreNode: (nodeId: string) => void;
  returnNode: (nodeId: string, now?: string) => boolean;
  reviewSession: ReviewSessionState;
  rowSpacing: number;
  selectedNodeIds: string[];
  selectedTrashNodeId: string | null;
  showTitleSearch: boolean;
  showVirtualCreateAction?: boolean;
  state: NodeListState;
  updateNodeTitle: (nodeId: string, title: string) => void;
}

export function NodeListTreeContent(props: NodeListTreeContentProps) {
  const { filteredActiveRows, searchQuery, setSearchQuery } = useNodeListSearchRows({
    activeRows: props.activeRows,
    isTrashViewOpen: props.isTrashViewOpen,
    isVirtualViewOpen: props.isVirtualViewOpen,
    noteRowsAll: props.state.noteRowsAll,
    trashRowsAll: props.state.trashRowsAll
  });

  return (
    <>
      <NodeListPanel
        activeCollapsedNodeIds={props.activeCollapsedNodeIds}
        activeNodeId={props.activeNodeId}
        activeRows={filteredActiveRows}
        bodyAppendContent={props.bodyAppendContent}
        collapse={props.collapse}
        contextMenu={props.contextMenu}
        createGlobalNode={props.createGlobalNode}
        createVirtualNode={props.createVirtualNode}
        deleteNodesPermanently={props.deleteNodesPermanently}
        deleteStatusLabel={props.deleteStatusLabel}
        isTrashViewOpen={props.isTrashViewOpen}
        isVirtualViewOpen={props.isVirtualViewOpen}
        moveNodes={props.moveNodes}
        nodesById={props.nodesById}
        noteRowIds={props.state.noteRowIds}
        onOpenNotesView={props.onOpenNotesView}
        onRenameNode={props.updateNodeTitle}
        onSearchQueryChange={setSearchQuery}
        onSelect={props.onSelect}
        reviewSession={props.reviewSession}
        rowSpacing={props.rowSpacing}
        searchQuery={searchQuery}
        selectedNodeIds={props.selectedNodeIds}
        selectedTrashNodeId={props.selectedTrashNodeId}
        showTitleSearch={props.showTitleSearch}
        showVirtualCreateAction={props.showVirtualCreateAction ?? true}
        trashRowIds={props.state.trashRowIds}
        trashRowsLength={props.state.trashRows.length}
      />
      <NodeListTreeMenu {...props} />
    </>
  );
}
