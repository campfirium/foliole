import { useState, type ReactNode } from 'react';

import { getCurrentReviewSchedulerSettings } from '../../settings/model/reviewSchedulerSettings';
import type { ReviewSessionState } from '../../../store/workspaceStore';
import type { NodeTreeRow } from '../model/nodeTree';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

import { NodeListPanel } from './NodeListPanel';
import type {
  NodeListCollapseController,
  NodeListContextMenuController
} from './NodeListTreeHooks';
import { NodeListTreeMenu } from './NodeListTreeMenu';
import { NodeReviewSchedulingDialog } from './NodeReviewSchedulingDialog';
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
  nodeOrder: string[];
  nodesById: WorkspaceListNodesById;
  onOpenMoveToNode: () => void;
  onOpenNotesView: () => void;
  onSelect: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  restoreNode: (nodeId: string) => void;
  returnNode: (nodeId: string, now?: string) => boolean;
  reviewSession: ReviewSessionState;
  rowCountByNodeId?: ReadonlyMap<string, number>;
  rowSpacing: number;
  selectedNodeIds: string[];
  selectedTrashNodeId: string | null;
  showTitleSearch: boolean;
  showVirtualCreateAction?: boolean;
  state: NodeListState;
  trashedNodeIds: string[];
  updateNodePriority: (nodeId: string, priority: number | null) => void;
  updateNodeShortTerm: (nodeId: string, enableShortTerm: boolean | null) => void;
  updateNodeTitle: (nodeId: string, title: string) => void;
}

export function NodeListTreeContent(props: NodeListTreeContentProps) {
  const [reviewSchedulingNodeId, setReviewSchedulingNodeId] = useState<string | null>(null);
  const { filteredActiveRows, searchQuery, setSearchQuery } = useNodeListSearchRows({
    activeRows: props.activeRows,
    isTrashViewOpen: props.isTrashViewOpen,
    isVirtualViewOpen: props.isVirtualViewOpen,
    nodeOrder: props.nodeOrder,
    nodesById: props.nodesById,
    noteRowsAll: props.state.noteRowsAll,
    trashRowsAll: props.state.trashRowsAll,
    trashedNodeIds: props.trashedNodeIds
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
        rowCountByNodeId={props.rowCountByNodeId}
        rowSpacing={props.rowSpacing}
        searchQuery={searchQuery}
        selectedNodeIds={props.selectedNodeIds}
        selectedTrashNodeId={props.selectedTrashNodeId}
        showTitleSearch={props.showTitleSearch}
        showVirtualCreateAction={props.showVirtualCreateAction ?? true}
        trashRowIds={props.state.trashRowIds}
        trashRowsLength={props.state.trashRows.length}
      />
      <NodeListTreeMenu {...props} onOpenReviewScheduling={setReviewSchedulingNodeId} />
      <NodeReviewSchedulingDialog
        defaultPriority={getCurrentReviewSchedulerSettings().pushQueue.defaultPriority}
        node={reviewSchedulingNodeId ? (props.nodesById[reviewSchedulingNodeId] ?? null) : null}
        nodesById={props.nodesById}
        onClose={() => setReviewSchedulingNodeId(null)}
        onPriorityChange={props.updateNodePriority}
        onShortTermChange={props.updateNodeShortTerm}
      />
    </>
  );
}
