import {
  canCreateChildNodeKind,
  findFolderTopicItemCommandByAppCommandId,
  resolveAllowedFolderTopicItemCommands
} from '../../../../lib/core/nodes/folderTopicItemCommands';
import { VIRTUAL_NODE_APP_COMMAND_ID } from '../../../../lib/core/nodes/virtualNodeCommands';
import { mergeRuntimeReadwiseTopicHighlights } from '../../../shared/platform/readwiseTopicMerge';
import { canNodeBeMoved } from '../model/nodeMovementRules';
import { isProtectedRootNode, isVirtualNode, isVirtualRootNode } from '../model/specialNodes';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

import { NodeListContextMenu } from './NodeListContextMenu';
import { hasDismissEntireTopicTargets, hasDismissTargets, hasReturnTargets } from './nodeListContextMenuReview';
import { createDismissEntireTopicAction, createDismissNodeAction, createReturnNodeAction } from './nodeListMenuActions';
import type { NodeListContextMenuController } from './NodeListTreeHooks';
import type { NodeListState, NodeSelectModifiers } from './NodeListTreeState';
import { requestNodeRename } from './NodeTreeRowRename';

interface NodeListTreeMenuProps {
  contextMenu: NodeListContextMenuController;
  createChildNode: (parentNodeId: string, content?: string, kind?: 'folder' | 'topic' | 'item') => string;
  createGlobalNode: (content?: string, kind?: 'folder' | 'topic' | 'item') => string;
  createVirtualNode: () => string;
  deleteNodes: (nodeIds: string[]) => void;
  deleteNodesPermanently: (nodeIds: string[]) => void;
  dismissNode: (nodeId: string, now?: string) => boolean;
  isVirtualViewOpen: boolean;
  nodesById: WorkspaceListNodesById;
  onOpenMoveToNode: () => void;
  onOpenReviewScheduling?: (nodeId: string) => void;
  onSelect: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  restoreNode: (nodeId: string) => void;
  returnNode: (nodeId: string, now?: string) => boolean;
  state: NodeListState;
}

function sortNodeIdsByVisibleOrder(nodeIds: string[], noteRowIds: string[]) {
  return [...nodeIds].sort((a, b) => noteRowIds.indexOf(a) - noteRowIds.indexOf(b));
}

function buildMenuState(props: NodeListTreeMenuProps) {
  const contextTargets = props.contextMenu.getContextTargets();
  const isNotesMenu = props.contextMenu.contextMenuMode === 'notes' || props.contextMenu.contextMenuMode === 'notes-root';
  const isRootMenu = props.contextMenu.contextMenuMode === 'notes-root';
  const primaryTargetId = contextTargets[0] ?? null;
  const primaryTarget = primaryTargetId ? props.nodesById[primaryTargetId] : undefined;
  const isSingleNodeTarget = Boolean(primaryTarget && contextTargets.length === 1);
  const showNodeImportActions =
    Boolean(primaryTarget) &&
    primaryTarget?.kind === 'topic' &&
    !primaryTarget.anchorLink &&
    !isVirtualRootNode(primaryTarget) &&
    !isVirtualNode(primaryTarget);

  return {
    contextTargets,
    isNotesMenu,
    isRootMenu,
    primaryTarget,
    primaryTargetId,
    showDeleteAction: isSingleNodeTarget ? !isProtectedRootNode(primaryTarget) : contextTargets.length > 0,
    showMergeHighlightsIntoTopicAction: showNodeImportActions,
    showMoveToNodeAction: isSingleNodeTarget && canNodeBeMoved(primaryTarget),
    showReviewSchedulingAction: isSingleNodeTarget && !isProtectedRootNode(primaryTarget) && !isVirtualRootNode(primaryTarget) && !isVirtualNode(primaryTarget),
    showNodeImportActions,
    showRenameAction: isSingleNodeTarget && !isProtectedRootNode(primaryTarget),
    showVirtualCreateOnly: props.isVirtualViewOpen || (isSingleNodeTarget && isVirtualRootNode(primaryTarget))
  };
}

function createCreateNodeHandler(
  props: NodeListTreeMenuProps,
  primaryTargetId: string | null,
  isRootMenu: boolean,
  showVirtualCreateOnly: boolean
) {
  return (commandId: string) => {
    if (commandId === VIRTUAL_NODE_APP_COMMAND_ID) {
      props.createVirtualNode();
      props.contextMenu.closeContextMenu();
      return;
    }
    const command = findFolderTopicItemCommandByAppCommandId(commandId);
    if (!command) {
      props.contextMenu.closeContextMenu();
      return;
    }
    if (showVirtualCreateOnly) {
      props.contextMenu.closeContextMenu();
      return;
    }
    if (isRootMenu || !primaryTargetId) {
      props.createGlobalNode('', command.kind);
      props.contextMenu.closeContextMenu();
      return;
    }
    const parentNode = props.nodesById[primaryTargetId];
    if (!parentNode || !canCreateChildNodeKind(parentNode.kind ?? null, command.kind)) {
      props.contextMenu.closeContextMenu();
      return;
    }
    props.createChildNode(primaryTargetId, '', command.kind);
    props.contextMenu.closeContextMenu();
  };
}

function createMoveToNodeHandler(props: NodeListTreeMenuProps, primaryTargetId: string | null) {
  return () => {
    if (!primaryTargetId) {
      props.contextMenu.closeContextMenu();
      return;
    }
    if (!canNodeBeMoved(props.nodesById[primaryTargetId])) {
      props.contextMenu.closeContextMenu();
      return;
    }
    props.onSelect(primaryTargetId);
    props.onOpenMoveToNode();
    props.contextMenu.closeContextMenu();
  };
}

function createOpenReviewSchedulingHandler(
  props: NodeListTreeMenuProps,
  primaryTargetId: string | null
) {
  return () => {
    if (primaryTargetId && props.onOpenReviewScheduling) {
      props.onOpenReviewScheduling(primaryTargetId);
    }
    props.contextMenu.closeContextMenu();
  };
}

function createMergeHighlightsIntoTopicHandler(args: {
  closeContextMenu: () => void;
  primaryTargetId: string | null;
}) {
  return () => {
    if (!args.primaryTargetId) {
      args.closeContextMenu();
      return;
    }
    void mergeRuntimeReadwiseTopicHighlights(args.primaryTargetId).then((result) => {
      if (!result || result.status === 'error') {
        window.alert('Merge failed.');
      }
    });
    args.closeContextMenu();
  };
}

function resolveCreateCommands(menuState: ReturnType<typeof buildMenuState>) {
  if (menuState.showVirtualCreateOnly || isVirtualNode(menuState.primaryTarget)) {
    return [];
  }
  return resolveAllowedFolderTopicItemCommands(menuState.isRootMenu ? null : menuState.primaryTarget?.kind ?? null);
}

export function NodeListTreeMenu(props: NodeListTreeMenuProps) {
  if (!props.contextMenu.menuPosition) {
    return null;
  }

  const menuState = buildMenuState(props);

  return (
    <NodeListContextMenu
      createCommands={resolveCreateCommands(menuState)}
      isTrashMenu={props.contextMenu.contextMenuMode === 'trash'}
      left={props.contextMenu.menuPosition.left}
      onClose={props.contextMenu.closeContextMenu}
      onCreateCommand={createCreateNodeHandler(
        props,
        menuState.primaryTargetId,
        menuState.isRootMenu,
        menuState.showVirtualCreateOnly
      )}
      onDeleteNode={() => (
        props.deleteNodes(sortNodeIdsByVisibleOrder(menuState.contextTargets, props.state.noteRowIds)),
        props.contextMenu.closeContextMenu()
      )}
      onDeleteNodePermanently={() => (props.deleteNodesPermanently(menuState.contextTargets), props.contextMenu.closeContextMenu())}
      onDismissEntireTopic={createDismissEntireTopicAction(
        menuState.primaryTargetId,
        props.nodesById,
        props.dismissNode,
        props.contextMenu.closeContextMenu
      )}
      onDismissNode={createDismissNodeAction(menuState.contextTargets, props.dismissNode, props.contextMenu.closeContextMenu)}
      onMergeHighlightsIntoTopic={createMergeHighlightsIntoTopicHandler({
        closeContextMenu: props.contextMenu.closeContextMenu,
        primaryTargetId: menuState.primaryTargetId
      })}
      onMoveToNode={createMoveToNodeHandler(props, menuState.primaryTargetId)}
      onOpenReviewScheduling={createOpenReviewSchedulingHandler(props, menuState.primaryTargetId)}
      onPasteIntoNode={props.contextMenu.closeContextMenu}
      onRenameNode={() => (
        requestNodeRename(menuState.primaryTargetId),
        props.contextMenu.closeContextMenu()
      )}
      onRestoreNode={() => (
        menuState.contextTargets.forEach((id) => props.restoreNode(id)),
        props.contextMenu.closeContextMenu()
      )}
      onReturnNode={createReturnNodeAction(menuState.contextTargets, props.returnNode, props.contextMenu.closeContextMenu)}
      showDeleteAction={menuState.showDeleteAction}
      showDismissEntireTopicAction={menuState.isNotesMenu && hasDismissEntireTopicTargets(menuState.contextTargets, props.nodesById)}
      showDismissAction={menuState.isNotesMenu && hasDismissTargets(menuState.contextTargets, props.nodesById)}
      showMergeHighlightsIntoTopicAction={menuState.showMergeHighlightsIntoTopicAction}
      showMoveToNodeAction={menuState.showMoveToNodeAction}
      showReviewSchedulingAction={menuState.showReviewSchedulingAction && Boolean(props.onOpenReviewScheduling)}
      showPasteIntoNodeAction={menuState.showNodeImportActions}
      showRenameAction={menuState.showRenameAction}
      showRootCreateOnly={menuState.isRootMenu || menuState.showVirtualCreateOnly}
      showReturnAction={menuState.isNotesMenu && hasReturnTargets(menuState.contextTargets, props.nodesById)}
      top={props.contextMenu.menuPosition.top}
    />
  );
}
