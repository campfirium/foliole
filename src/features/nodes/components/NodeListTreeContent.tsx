import { useState, type ReactNode } from 'react';

import type { ReviewSessionState } from '../../../store/workspaceStore';
import { getCurrentReviewSchedulerSettings } from '../../settings/model/reviewSchedulerSettings';
import type { NodeDismissTargets } from '../model/nodeDismissTargets';
import type { NodeTreeRow } from '../model/nodeTree';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

import { useEmptyTrashConfirmation } from './EmptyTrashDialog';
import { NodeListPanel } from './NodeListPanel';
import type {
  NodeListCollapseController,
  NodeListContextMenuController
} from './NodeListTreeHooks';
import { NodeListTreeMenu } from './NodeListTreeMenu';
import type { NodeListState, NodeSelectModifiers } from './NodeListTreeState';
import { NodeReviewSchedulingDialog } from './NodeReviewSchedulingDialog';
import { useNodeListRename } from './useNodeListRename';
import { useNodeListSearchRows } from './useNodeListSearchRows';

interface NodeListTreeContentProps {
  activeCollapsedNodeIds: ReadonlySet<string>;
  activeNodeId: string | null;
  activeRows: NodeTreeRow[];
  bodyAppendContent?: ReactNode;
  collapse: NodeListCollapseController;
  contextMenu: NodeListContextMenuController;
  createChildNode: (parentNodeId: string, content?: string, kind?: 'folder' | 'topic' | 'item') => Promise<string | null>;
  createGlobalNode: (content?: string, kind?: 'folder' | 'topic' | 'item') => Promise<string | null>;
  createVirtualNode: () => Promise<string | null>;
  deleteNodes: (nodeIds: string[]) => void;
  deleteNodesPermanently: (nodeIds: string[]) => void;
  deleteStatusLabel: string | null;
  dismissNode: (nodeId: string, now?: string) => boolean;
  dismissNodes: (targets: NodeDismissTargets, now?: string) => boolean;
  highlightedNodeId: string | null;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  moveNodes: (
    nodeIds: string[],
    targetNodeId: string | null,
    intent: 'before' | 'after' | 'child' | 'root'
  ) => Promise<boolean>;
  nodeOrder: string[];
  nodesById: WorkspaceListNodesById;
  onAddToDive?: (nodeIds: string[]) => void;
  onAddToVirtualFolder?: (nodeIds: string[]) => void;
  onOpenMoveToNode: () => void;
  onOpenNotesView: () => void;
  onSelect: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  restoreNode: (nodeId: string) => void;
  returnNode: (nodeId: string, now?: string) => boolean;
  reviewSession: ReviewSessionState;
  rowCountByNodeId?: ReadonlyMap<string, number> | undefined;
  rowSpacing: number;
  scrollTargetNodeId: string | null;
  selectedNodeIds: string[];
  selectedTrashNodeId: string | null;
  setNodeSequentialReading: (nodeId: string, enabled: boolean, now?: string) => boolean | Promise<boolean>;
  shelveNode: (nodeId: string, now?: string) => boolean;
  showTitleSearch: boolean;
  showVirtualCreateAction?: boolean;
  state: NodeListState;
  trashedNodeIds: string[];
  updateNodeDesiredRetention: (nodeId: string, desiredRetention: number | null) => void;
  updateNodePriority: (nodeId: string, priority: number | null) => void;
  updateNodeShortTerm: (nodeId: string, enableShortTerm: boolean | null) => void;
  updateNodeTitle: (nodeId: string, title: string) => Promise<boolean>;
  unshelveNode: (nodeId: string, now?: string) => boolean;
  virtualizeRows: boolean;
}

function renderReviewSchedulingDialog(props: NodeListTreeContentProps, nodeId: string | null, onClose: () => void) {
  return (
    <NodeReviewSchedulingDialog
      defaultDesiredRetention={getCurrentReviewSchedulerSettings().desiredRetention}
      defaultPriority={getCurrentReviewSchedulerSettings().pushQueue.defaultPriority}
      node={nodeId ? (props.nodesById[nodeId] ?? null) : null}
      nodesById={props.nodesById}
      onClose={onClose}
      onDesiredRetentionChange={props.updateNodeDesiredRetention}
      onPriorityChange={props.updateNodePriority}
      onShortTermChange={props.updateNodeShortTerm}
    />
  );
}

export function NodeListTreeContent(props: NodeListTreeContentProps) {
  const [reviewSchedulingNodeId, setReviewSchedulingNodeId] = useState<string | null>(null);
  const { filteredActiveRows, searchQuery, setSearchQuery } = useNodeListSearchRows({
    ...props,
    noteRowsAll: props.state.noteRowsAll,
    trashedNodeIds: props.trashedNodeIds
  });
  const emptyTrash = useEmptyTrashConfirmation();
  const renameNode = useNodeListRename(props.updateNodeTitle);

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
        deleteStatusLabel={props.deleteStatusLabel}
        highlightedNodeId={props.highlightedNodeId}
        isTrashViewOpen={props.isTrashViewOpen}
        isVirtualViewOpen={props.isVirtualViewOpen}
        moveNodes={props.moveNodes}
        nodesById={props.nodesById}
        noteRowIds={props.state.noteRowIds}
        onEmptyTrash={emptyTrash.request}
        onOpenNotesView={props.onOpenNotesView}
        onRenameNode={renameNode}
        onSearchQueryChange={setSearchQuery}
        onSelect={props.onSelect}
        reviewSession={props.reviewSession}
        rowCountByNodeId={props.rowCountByNodeId}
        rowSpacing={props.rowSpacing}
        scrollTargetNodeId={props.scrollTargetNodeId}
        searchQuery={searchQuery}
        selectedNodeIds={props.selectedNodeIds}
        selectedTrashNodeId={props.selectedTrashNodeId}
        showTitleSearch={props.showTitleSearch}
        showVirtualCreateAction={props.showVirtualCreateAction ?? true}
        trashRowsLength={props.trashedNodeIds.length}
        virtualizeRows={props.virtualizeRows}
      />
      <NodeListTreeMenu
        {...props}
        emptyTrashAction={{ disabled: props.trashedNodeIds.length === 0, onSelect: emptyTrash.request }}
        onOpenReviewScheduling={setReviewSchedulingNodeId}
      />
      {emptyTrash.dialog}
      {renderReviewSchedulingDialog(props, reviewSchedulingNodeId, () => setReviewSchedulingNodeId(null))}
    </>
  );
}
