import { isInboxNode } from '../model/specialNodes';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

import { NodeListContextMenu } from './NodeListContextMenu';
import { hasDismissTargets, hasReturnTargets } from './nodeListContextMenuReview';
import { createDismissNodeAction, createReturnNodeAction } from './nodeListMenuActions';
import type { NodeListContextMenuController } from './NodeListTreeHooks';
import type { NodeListState, NodeSelectModifiers } from './NodeListTreeState';

interface NodeListTreeMenuProps {
  contextMenu: NodeListContextMenuController;
  createChildNode: (parentNodeId: string, content?: string) => string;
  createGlobalNode: (content?: string) => string;
  deleteNodes: (nodeIds: string[]) => void;
  deleteNodesPermanently: (nodeIds: string[]) => void;
  dismissNode: (nodeId: string, now?: string) => boolean;
  nodesById: WorkspaceListNodesById;
  onOpenMoveToNode: () => void;
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

  return {
    contextTargets,
    isNotesMenu,
    isRootMenu,
    primaryTarget,
    primaryTargetId,
    showDeleteAction: isSingleNodeTarget ? !isInboxNode(primaryTarget) : contextTargets.length > 0,
    showMoveToNodeAction: isSingleNodeTarget && !isInboxNode(primaryTarget),
    showNodeImportActions: isSingleNodeTarget && !primaryTarget?.anchorLink
  };
}

function createCreateNodeHandler(props: NodeListTreeMenuProps, primaryTargetId: string | null, isRootMenu: boolean) {
  return () => {
    if (isRootMenu || !primaryTargetId) {
      props.createGlobalNode('');
      props.contextMenu.closeContextMenu();
      return;
    }
    props.createChildNode(primaryTargetId, '');
    props.contextMenu.closeContextMenu();
  };
}

function createMoveToNodeHandler(props: NodeListTreeMenuProps, primaryTargetId: string | null) {
  return () => {
    if (!primaryTargetId) {
      props.contextMenu.closeContextMenu();
      return;
    }
    props.onSelect(primaryTargetId);
    props.onOpenMoveToNode();
    props.contextMenu.closeContextMenu();
  };
}

export function NodeListTreeMenu(props: NodeListTreeMenuProps) {
  if (!props.contextMenu.menuPosition) {
    return null;
  }

  const menuState = buildMenuState(props);

  return (
    <NodeListContextMenu
      isTrashMenu={props.contextMenu.contextMenuMode === 'trash'}
      left={props.contextMenu.menuPosition.left}
      onClose={props.contextMenu.closeContextMenu}
      onCreateNode={createCreateNodeHandler(props, menuState.primaryTargetId, menuState.isRootMenu)}
      onDeleteNode={() => (
        props.deleteNodes(sortNodeIdsByVisibleOrder(menuState.contextTargets, props.state.noteRowIds)),
        props.contextMenu.closeContextMenu()
      )}
      onDeleteNodePermanently={() => (props.deleteNodesPermanently(menuState.contextTargets), props.contextMenu.closeContextMenu())}
      onDismissNode={createDismissNodeAction(menuState.contextTargets, props.dismissNode, props.contextMenu.closeContextMenu)}
      onImportIntoNode={props.contextMenu.closeContextMenu}
      onMoveToNode={createMoveToNodeHandler(props, menuState.primaryTargetId)}
      onPasteIntoNode={props.contextMenu.closeContextMenu}
      onRestoreNode={() => (
        menuState.contextTargets.forEach((id) => props.restoreNode(id)),
        props.contextMenu.closeContextMenu()
      )}
      onReturnNode={createReturnNodeAction(menuState.contextTargets, props.returnNode, props.contextMenu.closeContextMenu)}
      showDeleteAction={menuState.showDeleteAction}
      showDismissAction={menuState.isNotesMenu && hasDismissTargets(menuState.contextTargets, props.nodesById)}
      showImportIntoNodeAction={menuState.showNodeImportActions}
      showMoveToNodeAction={menuState.showMoveToNodeAction}
      showPasteIntoNodeAction={menuState.showNodeImportActions}
      showRootCreateOnly={menuState.isRootMenu}
      showReturnAction={menuState.isNotesMenu && hasReturnTargets(menuState.contextTargets, props.nodesById)}
      top={props.contextMenu.menuPosition.top}
    />
  );
}
