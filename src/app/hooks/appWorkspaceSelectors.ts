import { useMemo, useRef } from 'react';
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
    continueReviewSessionReading: state.continueReviewSessionReading,
    dismissReviewTopic: state.dismissReviewTopic,
    readReviewTopic: state.readReviewTopic,
    postponeReviewTopic: state.postponeReviewTopic,
    setReviewTopicDelay: state.setReviewTopicDelay,
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
    updateNodeDerivedTitle: state.updateNodeDerivedTitle,
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

type WorkspaceMembershipView = ReturnType<typeof selectCanonicalWorkspaceMembershipView>;

function areStringArraysEqual(previous: readonly string[], next: readonly string[]) {
  return previous.length === next.length && previous.every((value, index) => value === next[index]);
}

function areStringRecordsEqual(previous: Record<string, string>, next: Record<string, string>) {
  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);
  return (
    previousKeys.length === nextKeys.length &&
    previousKeys.every((key) => previous[key] === next[key])
  );
}

function stabilizeWorkspaceMembershipView(
  previous: WorkspaceMembershipView | null,
  next: WorkspaceMembershipView
): WorkspaceMembershipView {
  if (!previous) {
    return next;
  }
  const nodeOrder = areStringArraysEqual(previous.nodeOrder, next.nodeOrder) ? previous.nodeOrder : next.nodeOrder;
  const trashedNodeIds = areStringArraysEqual(previous.trashedNodeIds, next.trashedNodeIds)
    ? previous.trashedNodeIds
    : next.trashedNodeIds;
  return {
    ...next,
    nodeOrder,
    reviewQueueSource: {
      ...next.reviewQueueSource,
      nodeOrder,
      trashedNodeIds
    },
    trashedNodeDeletedAtById: areStringRecordsEqual(previous.trashedNodeDeletedAtById, next.trashedNodeDeletedAtById)
      ? previous.trashedNodeDeletedAtById
      : next.trashedNodeDeletedAtById,
    trashedNodeIds
  };
}

function useStableWorkspaceMembershipView(ws: ReturnType<typeof selectWorkspaceHookState>) {
  const previousRef = useRef<WorkspaceMembershipView | null>(null);
  return useMemo(() => {
    const next = selectCanonicalWorkspaceMembershipView(ws);
    const stable = stabilizeWorkspaceMembershipView(previousRef.current, next);
    previousRef.current = stable;
    return stable;
  }, [
    ws.nodeOrder,
    ws.nodesById,
    ws.trashedNodeDeletedAtById,
    ws.trashedNodeIds
  ]);
}

export function useWorkspaceSelectors() {
  const ws = useWorkspaceStore(useShallow(selectWorkspaceHookState));
  const membership = useStableWorkspaceMembershipView(ws);
  const layout = useWorkspaceLayoutState();
  const publicWorkspaceState = omitLegacyTrashDeletedAtMap(ws);
  return {
    ...publicWorkspaceState,
    ...layout,
    nodeOrder: membership.nodeOrder,
    trashedNodeIds: membership.trashedNodeIds
  };
}
