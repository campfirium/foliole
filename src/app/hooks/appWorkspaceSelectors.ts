import { useShallow } from 'zustand/react/shallow';

import { useWorkspaceLayoutState } from '../../store/workspaceLayoutDomain';
import { useWorkspaceStore } from '../../store/workspaceStore';

export function useWorkspaceSelectors() {
  const ws = useWorkspaceStore(
    useShallow((state) => ({
      activeNodeId: state.activeNodeId,
      appActionHistory: state.appActionHistory,
      isHydrated: state.isHydrated,
      createChildNode: state.createChildNode,
      createVirtualNode: state.createVirtualNode,
      createHighlightNodeFromSelection: state.createHighlightNodeFromSelection,
      createImageClozeNodes: state.createImageClozeNodes,
      createQANodeFromSelection: state.createQANodeFromSelection,
      createRootNode: state.createRootNode,
      deleteNode: state.deleteNode,
      deleteNodePermanently: state.deleteNodePermanently,
      deleteImageClozeRegion: state.deleteImageClozeRegion,
      dismissReviewItem: state.dismissReviewItem,
      completeReviewItem: state.completeReviewItem,
      deferReviewItem: state.deferReviewItem,
      goBack: state.goBack,
      goForward: state.goForward,
      goToParent: state.goToParent,
      gradeReviewCard: state.gradeReviewCard,
      jumpToAncestorNode: state.jumpToAncestorNode,
      moveNode: state.moveNode,
      moveNodes: state.moveNodes,
      navigation: state.navigation,
      nodesById: state.nodesById,
      nodeOrder: state.nodeOrder,
      nodeViewById: state.nodeViewById,
      openNode: state.openNode,
      redoWorkspaceAction: state.redoWorkspaceAction,
      revealReviewAnswer: state.revealReviewAnswer,
      reviewSession: state.reviewSession,
      setNodeViewState: state.setNodeViewState,
      startReviewSession: state.startReviewSession,
      trashedNodeIds: state.trashedNodeIds,
      updateNodeContent: state.updateNodeContent,
      updateHighlightAnchorRange: state.updateHighlightAnchorRange ?? (() => false),
      updateVirtualNodeFilter: state.updateVirtualNodeFilter,
      updateNodeDesiredRetention: state.updateNodeDesiredRetention,
      updateNodePriority: state.updateNodePriority,
      updateNodeReveal: state.updateNodeReveal,
      undoWorkspaceAction: state.undoWorkspaceAction,
      exitReviewSession: state.exitReviewSession
    }))
  );
  const layout = useWorkspaceLayoutState();
  return { ...ws, ...layout };
}
