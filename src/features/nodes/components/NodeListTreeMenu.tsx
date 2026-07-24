import { requestFoliolePublishedDelete } from '../../../shared/platform/foliolePublishedManagement';
import { mergeRuntimeReadwiseTopicHighlights } from '../../../shared/platform/readwiseTopicMerge';
import { showAppRuntimeNotice } from '../../../shared/ui/AppRuntimeNotice';
import { canNodeBeMoved } from '../model/nodeMovementRules';
import { isHomeNode, isProtectedRootNode, isVirtualNode, isVirtualRootNode } from '../model/specialNodes';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

import { NodeListContextMenu } from './NodeListContextMenu';
import { canPostponeTopic, canToggleSequentialReading, hasDismissEntireTopicTargets, hasDismissTargets, hasReturnTargets, hasShelveTopicTarget, hasUnshelveTopicTarget } from './nodeListContextMenuReview';
import { createDismissEntireTopicAction, createDismissNodeAction, createReturnNodeAction, createShelveTopicAction, createToggleSequentialReadingAction, createUnshelveTopicAction } from './nodeListMenuActions';
import { createOptionalNodeMenuHandler } from './nodeListMenuOpenHandlers';
import { sortNodeIdsByVisibleOrder } from './nodeListMenuTargetOrder';
import { createCreateNodeHandler, resolveCreateCommands, type NodeListCreateMenuSurface } from './NodeListTreeCreateMenu';
import type { NodeListContextMenuController } from './NodeListTreeHooks';
import type { NodeListState, NodeSelectModifiers } from './NodeListTreeState';
import { requestNodeRename } from './NodeTreeRowRename';

interface NodeListTreeMenuProps {
  contextMenu: NodeListContextMenuController;
  createMenuSurface?: NodeListCreateMenuSurface;
  createChildNode: (parentNodeId: string, content?: string, kind?: 'folder' | 'topic' | 'item') => Promise<string | null>;
  createGlobalNode: (content?: string, kind?: 'folder' | 'topic' | 'item') => Promise<string | null>;
  createVirtualNode: () => Promise<string | null>;
  deleteNodes: (nodeIds: string[]) => void;
  deleteNodesPermanently: (nodeIds: string[]) => void;
  dismissNode: (nodeId: string, now?: string) => boolean;
  isVirtualViewOpen: boolean;
  nodesById: WorkspaceListNodesById;
  onAddToVirtualFolder?: (nodeIds: string[]) => void;
  onOpenMoveToNode: () => void;
  onOpenPostponeTopic?: (nodeId: string) => void;
  onRemoveFromCurrentVirtualFolder?: (nodeIds: string[]) => void;
  onCreateTopicFromClipboard?: (parentNodeId: string | null) => void;
  onOpenReviewScheduling?: (nodeId: string) => void;
  onSelect: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  restoreNode: (nodeId: string) => void;
  returnNode: (nodeId: string, now?: string) => boolean;
  setNodeSequentialReading: (nodeId: string, enabled: boolean, now?: string) => boolean;
  shelveNode: (nodeId: string, now?: string) => boolean;
  state: NodeListState;
  unshelveNode: (nodeId: string, now?: string) => boolean;
}

function buildMenuState(props: NodeListTreeMenuProps) {
  const contextTargets = props.contextMenu.getContextTargets();
  const isNotesMenu = props.contextMenu.contextMenuMode === 'notes' || props.contextMenu.contextMenuMode === 'notes-root';
  const isRootMenu = props.contextMenu.contextMenuMode === 'notes-root';
  const primaryTargetId = contextTargets[0] ?? null;
  const primaryTarget = primaryTargetId ? props.nodesById[primaryTargetId] : undefined;
  const isHomeTarget = isHomeNode(primaryTarget);
  const isSingleNodeTarget = Boolean(primaryTarget && contextTargets.length === 1);
  const showNodeImportActions =
    Boolean(primaryTarget) &&
    primaryTarget?.kind === 'topic' &&
    !primaryTarget.anchorLink &&
    !isVirtualRootNode(primaryTarget) &&
    !isVirtualNode(primaryTarget);

  return {
    contextTargets,
    createMenuSurface: props.createMenuSurface ?? 'folders',
    isHomeTarget,
    isNotesMenu,
    isRootMenu,
    primaryTarget,
    primaryTargetId,
    showDeleteAction: isSingleNodeTarget ? !isProtectedRootNode(primaryTarget) : contextTargets.length > 0,
    showMergeHighlightsIntoTopicAction: showNodeImportActions,
    showAddToVirtualFolderAction: contextTargets.length > 0 && contextTargets.every((nodeId) => props.nodesById[nodeId]?.kind === 'topic'),
    showMoveToNodeAction: props.createMenuSurface !== 'virtual-topics' && isSingleNodeTarget && canNodeBeMoved(primaryTarget),
    showReviewSchedulingAction: isSingleNodeTarget && !isProtectedRootNode(primaryTarget) && !isVirtualRootNode(primaryTarget) && !isVirtualNode(primaryTarget),
    showPostponeTopicAction: isSingleNodeTarget && canPostponeTopic(primaryTarget),
    showSequentialReadingAction: isSingleNodeTarget && canToggleSequentialReading(primaryTarget, props.nodesById),
    showNodeImportActions,
    showRenameAction: isSingleNodeTarget && !isProtectedRootNode(primaryTarget),
    showVirtualCreateOnly: props.isVirtualViewOpen || (isSingleNodeTarget && isVirtualRootNode(primaryTarget))
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
        showAppRuntimeNotice('Merge failed.');
      }
    });
    args.closeContextMenu();
  };
}

function buildNodeListActionHandlers(
  props: NodeListTreeMenuProps,
  menuState: ReturnType<typeof buildMenuState>
) {
  return {
    onDismissEntireTopic: createDismissEntireTopicAction(
      menuState.primaryTargetId,
      props.nodesById,
      props.dismissNode,
      props.contextMenu.closeContextMenu
    ),
    onDismissNode: createDismissNodeAction(menuState.primaryTargetId, props.dismissNode, props.contextMenu.closeContextMenu),
    onMergeHighlightsIntoTopic: createMergeHighlightsIntoTopicHandler({
      closeContextMenu: props.contextMenu.closeContextMenu,
      primaryTargetId: menuState.primaryTargetId
    }),
    onMoveToNode: createMoveToNodeHandler(props, menuState.primaryTargetId),
    onOpenReviewScheduling: createOptionalNodeMenuHandler(menuState.primaryTargetId, props.onOpenReviewScheduling, props.contextMenu.closeContextMenu),
    onOpenPostponeTopic: createOptionalNodeMenuHandler(menuState.primaryTargetId, props.onOpenPostponeTopic, props.contextMenu.closeContextMenu),
    onReturnNode: createReturnNodeAction(menuState.contextTargets, props.returnNode, props.contextMenu.closeContextMenu),
    onShelveTopic: createShelveTopicAction(menuState.primaryTargetId, props.shelveNode, props.contextMenu.closeContextMenu),
    onToggleSequentialReading: createToggleSequentialReadingAction({
      closeContextMenu: props.contextMenu.closeContextMenu,
      nodesById: props.nodesById,
      primaryTargetId: menuState.primaryTargetId,
      setNodeSequentialReading: props.setNodeSequentialReading
    }),
    onUnshelveTopic: createUnshelveTopicAction(menuState.primaryTargetId, props.unshelveNode, props.contextMenu.closeContextMenu)
  };
}

function buildNodeListMenuVisibility(
  props: NodeListTreeMenuProps,
  menuState: ReturnType<typeof buildMenuState>
) {
  const showDismissEntireTopicAction = menuState.isNotesMenu && hasDismissEntireTopicTargets(menuState.contextTargets, props.nodesById);
  return {
    showDeleteAction: menuState.showDeleteAction,
    showAddToVirtualFolderAction: menuState.showAddToVirtualFolderAction && Boolean(props.onAddToVirtualFolder),
    showDismissAction: menuState.isNotesMenu && !showDismissEntireTopicAction && hasDismissTargets(menuState.primaryTargetId ? [menuState.primaryTargetId] : [], props.nodesById),
    showDismissEntireTopicAction,
    showMergeHighlightsIntoTopicAction: menuState.showMergeHighlightsIntoTopicAction,
    showMoveToNodeAction: menuState.showMoveToNodeAction,
    showCreateTopicFromClipboardAction: resolveCreateCommands(menuState).some((command) => command.kind === 'topic') && Boolean(props.onCreateTopicFromClipboard),
    showRenameAction: menuState.showRenameAction,
    showReturnAction: menuState.isNotesMenu && hasReturnTargets(menuState.contextTargets, props.nodesById),
    showShelveTopicAction: menuState.isNotesMenu && hasShelveTopicTarget(menuState.contextTargets, props.nodesById),
    showReviewSchedulingAction: menuState.showReviewSchedulingAction && Boolean(props.onOpenReviewScheduling),
    showPostponeTopicAction: menuState.showPostponeTopicAction && Boolean(props.onOpenPostponeTopic),
    showRemoveFromCurrentVirtualFolderAction: props.createMenuSurface === 'virtual-topics' && Boolean(props.onRemoveFromCurrentVirtualFolder),
    showRootCreateOnly: menuState.isRootMenu || menuState.isHomeTarget || menuState.showVirtualCreateOnly,
    showSequentialReadingAction: menuState.isNotesMenu && menuState.showSequentialReadingAction,
    showUnshelveTopicAction: menuState.isNotesMenu && hasUnshelveTopicTarget(menuState.contextTargets, props.nodesById)
  };
}

function buildNodeListContextMenuProps(
  props: NodeListTreeMenuProps,
  menuPosition: NonNullable<NodeListContextMenuController['menuPosition']>,
  menuState: ReturnType<typeof buildMenuState>
) {
  return {
    createCommands: resolveCreateCommands(menuState),
    isTrashMenu: props.contextMenu.contextMenuMode === 'trash',
    left: menuPosition.left,
    onClose: props.contextMenu.closeContextMenu,
    onCreateCommand: createCreateNodeHandler(props, menuState),
    onCreateTopicFromClipboard: () => {
      const parentNodeId = menuState.isRootMenu || menuState.isHomeTarget || !menuState.primaryTargetId
        ? null
        : menuState.primaryTargetId;
      props.onCreateTopicFromClipboard?.(parentNodeId);
      props.contextMenu.closeContextMenu();
    },
    onDeleteNode: () => {
      const nodeIds = sortNodeIdsByVisibleOrder(menuState.contextTargets, props.state.noteRowIds);
      requestFoliolePublishedDelete({
        nodeIds,
        onAllowed: () => props.deleteNodes(nodeIds)
      });
      props.contextMenu.closeContextMenu();
    },
    onDeleteNodePermanently: () => (props.deleteNodesPermanently(menuState.contextTargets), props.contextMenu.closeContextMenu()),
    onAddToVirtualFolder: () => (props.onAddToVirtualFolder?.(menuState.contextTargets), props.contextMenu.closeContextMenu()),
    onRemoveFromCurrentVirtualFolder: () => (props.onRemoveFromCurrentVirtualFolder?.(menuState.contextTargets), props.contextMenu.closeContextMenu()),
    ...buildNodeListActionHandlers(props, menuState),
    onRenameNode: () => (requestNodeRename(menuState.primaryTargetId), props.contextMenu.closeContextMenu()),
    onRestoreNode: () => (
      menuState.contextTargets.forEach((id) => props.restoreNode(id)),
      props.contextMenu.closeContextMenu()
    ),
    sequentialReadingEnabled: menuState.primaryTarget?.sequentialReadingEnabled === true,
    ...buildNodeListMenuVisibility(props, menuState),
    top: menuPosition.top
  };
}

export function NodeListTreeMenu(props: NodeListTreeMenuProps) {
  if (!props.contextMenu.menuPosition) {
    return null;
  }

  return <NodeListContextMenu {...buildNodeListContextMenuProps(props, props.contextMenu.menuPosition, buildMenuState(props))} />;
}
