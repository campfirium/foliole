import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { selectCanonicalWorkspaceMembershipView } from '../../store/workspaceCanonicalSelectors';
import { useWorkspaceLayoutState } from '../../store/workspaceLayoutDomain';
import { useWorkspaceStore, type WorkspaceState } from '../../store/workspaceStore';

function selectWorkspaceCreationActions(state: WorkspaceState) {
  return {
    createChildNode: state.createChildNode,
    createVirtualNode: state.createVirtualNode,
    createFormulaClozeNode: state.createFormulaClozeNode,
    createHighlightNodeFromSelection: state.createHighlightNodeFromSelection,
    createImageClozeNodes: state.createImageClozeNodes,
    createQANodeFromSelection: state.createQANodeFromSelection,
    createRootNode: state.createRootNode
  };
}

function selectWorkspaceReviewActions(state: WorkspaceState) {
  return {
    dismissReviewTopic: state.dismissReviewTopic,
    readReviewTopic: state.readReviewTopic,
    postponeReviewTopic: state.postponeReviewTopic,
    revisitReviewTopicSoon: state.revisitReviewTopicSoon,
    gradeReviewCard: state.gradeReviewCard,
    revealReviewAnswer: state.revealReviewAnswer,
    resumeReviewSession: state.resumeReviewSession,
    setReviewSessionMode: state.setReviewSessionMode,
    startReviewSession: state.startReviewSession,
    exitReviewSession: state.exitReviewSession
  };
}

function selectWorkspaceNavigationActions(state: WorkspaceState) {
  return {
    goBack: state.goBack,
    goForward: state.goForward,
    goToParent: state.goToParent,
    jumpToAncestorNode: state.jumpToAncestorNode,
    openNode: state.openNode
  };
}

function selectWorkspaceMutationActions(state: WorkspaceState) {
  return {
    deleteNode: state.deleteNode,
    deleteEditorAnnotationNodes: state.deleteEditorAnnotationNodes,
    deleteNodePermanently: state.deleteNodePermanently,
    deleteImageClozeRegion: state.deleteImageClozeRegion,
    moveNode: state.moveNode,
    moveNodes: state.moveNodes,
    redoWorkspaceAction: state.redoWorkspaceAction,
    redoEditorOperation: state.redoEditorOperation,
    setNodeViewState: state.setNodeViewState,
    updateNodeContent: state.updateNodeContent,
    pushEditorOperationEntry: state.pushEditorOperationEntry,
    updateHighlightAnchorRange: state.updateHighlightAnchorRange ?? (() => false),
    updateVirtualNodeFilter: state.updateVirtualNodeFilter,
    updateNodeDesiredRetention: state.updateNodeDesiredRetention,
    updateNodePriority: state.updateNodePriority,
    updateNodeShortTerm: state.updateNodeShortTerm,
    updateNodeReveal: state.updateNodeReveal,
    undoWorkspaceAction: state.undoWorkspaceAction,
    undoEditorOperation: state.undoEditorOperation
  };
}

function selectWorkspaceHookState(state: WorkspaceState) {
  return {
    activeNodeId: state.activeNodeId,
    appActionHistory: state.appActionHistory,
    editorOperationHistory: state.editorOperationHistory,
    isHydrated: state.isHydrated,
    navigation: state.navigation,
    nodesById: state.nodesById,
    nodeOrder: state.nodeOrder,
    nodeViewById: state.nodeViewById,
    reviewSession: state.reviewSession,
    reviewSessionMode: state.reviewSessionMode,
    trashedNodeDeletedAtById: state.trashedNodeDeletedAtById,
    trashedNodeIds: state.trashedNodeIds,
    ...selectWorkspaceCreationActions(state),
    ...selectWorkspaceNavigationActions(state),
    ...selectWorkspaceMutationActions(state),
    ...selectWorkspaceReviewActions(state)
  };
}

function omitLegacyTrashDeletedAtMap<T extends { trashedNodeDeletedAtById: unknown }>(state: T) {
  const { trashedNodeDeletedAtById, ...rest } = state;
  void trashedNodeDeletedAtById;
  return rest;
}

export function useWorkspaceSelectors() {
  const ws = useWorkspaceStore(useShallow(selectWorkspaceHookState));
  const membership = useMemo(() => selectCanonicalWorkspaceMembershipView(ws), [
    ws.nodeOrder,
    ws.nodesById,
    ws.trashedNodeDeletedAtById,
    ws.trashedNodeIds
  ]);
  const layout = useWorkspaceLayoutState();
  const publicWorkspaceState = omitLegacyTrashDeletedAtMap(ws);
  return {
    ...publicWorkspaceState,
    ...layout,
    nodeOrder: membership.nodeOrder,
    trashedNodeIds: membership.trashedNodeIds
  };
}
