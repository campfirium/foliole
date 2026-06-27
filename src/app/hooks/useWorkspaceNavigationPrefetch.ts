import { useCallback } from 'react';
import type { MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { Node, NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { markNodeSelectionRequested } from '../../shared/platform/performanceDiagnosticsProbe';
import { hasWorkspaceRuntimeRepository } from '../../shared/platform/workspaceRuntimeRepository';
import type { NodeNavigationResult } from '../../store/workspaceNavigation';
import { isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { useBreadcrumbSelectionAction, usePreparedOpenNodeAction } from './usePreparedNodeSelectionActions';
import { useNavigationTargetResolvers, useNodeDocumentPrefetch } from './useWorkspaceNavigationPrefetchHelpers';

export interface PreparedNavigationDependencies {
  activeNodeContent: string | null;
  activeNodeId: string | null;
  closeContextMenu: () => void;
  editorRef: MutableRefObject<EditorAdapter | null>;
  flushPendingEditorDraft: () => void;
  flushPendingEditorDraftImmediately: () => Promise<boolean>;
  goBack: () => NodeNavigationResult | null;
  goForward: () => NodeNavigationResult | null;
  goToParent: () => NodeNavigationResult | null;
  jumpToAncestorNode: (nodeId: string) => NodeNavigationResult | null;
  nodesById: Record<string, Node>;
  openNode: (nodeId: string) => NodeNavigationResult | null;
  saveActiveNodeView: (nodeIdOverride?: string | null) => void;
  applyNavigationResult: (result: NodeNavigationResult | null) => void;
}

function useNavigationAction(
  action: () => NodeNavigationResult | null,
  flushPendingEditorDraft: () => void,
  flushPendingEditorDraftImmediately: () => Promise<boolean>,
  prepareForNavigation: (nodeIdOverride?: string | null) => void,
  finalize: (result: NodeNavigationResult | null) => void,
  resolveTargetNodeId: () => string | null,
  markRequested: (nodeId: string) => void,
  ensureNodeReady: (nodeId: string) => Promise<void>
) {
  return useCallback(async () => {
    const sourceNodeId = useWorkspaceStore.getState().activeNodeId;
    const targetNodeId = resolveTargetNodeId();
    if (targetNodeId) {
      markRequested(targetNodeId);
    }
    flushPendingEditorDraft();
    prepareForNavigation(sourceNodeId);
    const result = action();
    finalize(result);
    void flushPendingEditorDraftImmediately(); // fire-and-forget runtime persist drain; navigation stays non-blocking.
    if (targetNodeId) {
      void ensureNodeReady(targetNodeId);
    }
  }, [
    action,
    ensureNodeReady,
    finalize,
    flushPendingEditorDraft,
    flushPendingEditorDraftImmediately,
    markRequested,
    prepareForNavigation,
    resolveTargetNodeId
  ]);
}

function useSelectNodeAction(
  activeNodeId: string | null,
  action: (nodeId: string) => NodeNavigationResult | null,
  prepareForNavigation: (nodeIdOverride?: string | null) => void,
  flushPendingEditorDraft: () => void,
  flushPendingEditorDraftImmediately: () => Promise<boolean>,
  finalize: (result: NodeNavigationResult | null) => void,
  markRequested: (nodeId: string) => void,
  ensureNodeReady: (nodeId: string) => Promise<void>,
  openPreparedNode: (nodeId: string, focusAnchor?: NodeNavigationResult['focusAnchor']) => Promise<void>
) {
  return useCallback(
    async (nodeId: string, focusAnchor: NodeAnchorLink | null = null) => {
      if (focusAnchor && activeNodeId === nodeId) {
        markRequested(nodeId);
        flushPendingEditorDraft();
        finalize({ focusAnchor, nodeId });
        return;
      }
      const targetNode = useWorkspaceStore.getState().nodesById[nodeId];
      if (targetNode && !isNodeDocumentLoaded(targetNode) && hasWorkspaceRuntimeRepository()) {
        await openPreparedNode(nodeId, focusAnchor);
        return;
      }

      markRequested(nodeId);
      flushPendingEditorDraft();
      prepareForNavigation();
      const result = action(nodeId);
      finalize(result ? { ...result, focusAnchor } : result);
      void flushPendingEditorDraftImmediately(); // fire-and-forget runtime persist drain; navigation stays non-blocking.
      void ensureNodeReady(nodeId);
    },
    [
      action,
      activeNodeId,
      ensureNodeReady,
      finalize,
      flushPendingEditorDraft,
      flushPendingEditorDraftImmediately,
      markRequested,
      openPreparedNode,
      prepareForNavigation
    ]
  );
}

function useSelectionRequestedMarker(nodesById: Record<string, Node>) {
  return useCallback(
    (nodeId: string) => {
      markNodeSelectionRequested(nodeId, nodesById);
    },
    [nodesById]
  );
}

function useFinalizeNavigation(
  closeContextMenu: () => void,
  applyNavigationResult: (result: NodeNavigationResult | null) => void
) {
  return useCallback(
    (result: NodeNavigationResult | null) => {
      closeContextMenu();
      applyNavigationResult(result);
    },
    [applyNavigationResult, closeContextMenu]
  );
}

function useNavigationTransitionHandles(
  args: PreparedNavigationDependencies,
  finalizeNavigation: (result: NodeNavigationResult | null) => void,
  markSelectionRequested: (nodeId: string) => void,
  ensureNodeReady: (nodeId: string) => Promise<void>
) {
  const prepareForNavigation = useCallback(
    (nodeIdOverride?: string | null) => {
      args.saveActiveNodeView(nodeIdOverride);
    },
    [args.saveActiveNodeView]
  );
  const openPreparedNode = usePreparedOpenNodeAction(
    args.openNode,
    args.flushPendingEditorDraft,
    args.flushPendingEditorDraftImmediately,
    prepareForNavigation,
    finalizeNavigation,
    markSelectionRequested
  );
  const targetResolvers = useNavigationTargetResolvers(args.activeNodeId, args.nodesById);
  const handleSelectBreadcrumbNode = useBreadcrumbSelectionAction(
    args.activeNodeId,
    args.nodesById,
    args.jumpToAncestorNode,
    args.openNode,
    args.flushPendingEditorDraft,
    args.flushPendingEditorDraftImmediately,
    prepareForNavigation,
    finalizeNavigation,
    markSelectionRequested,
    ensureNodeReady,
    openPreparedNode
  );
  return { handleSelectBreadcrumbNode, openPreparedNode, prepareForNavigation, targetResolvers };
}

export function usePreparedNavigationHandlers(args: PreparedNavigationDependencies) {
  const markSelectionRequested = useSelectionRequestedMarker(args.nodesById);
  const ensureNodeReady = useNodeDocumentPrefetch();
  const finalizeNavigation = useFinalizeNavigation(args.closeContextMenu, args.applyNavigationResult);
  const { handleSelectBreadcrumbNode, openPreparedNode, prepareForNavigation, targetResolvers } = useNavigationTransitionHandles(
    args,
    finalizeNavigation,
    markSelectionRequested,
    ensureNodeReady
  );
  return {
    handleSelectNode: useSelectNodeAction(
      args.activeNodeId,
      args.openNode,
      prepareForNavigation,
      args.flushPendingEditorDraft,
      args.flushPendingEditorDraftImmediately,
      finalizeNavigation,
      markSelectionRequested,
      ensureNodeReady,
      openPreparedNode
    ),
    handleSelectBreadcrumbNode,
    handleGoBack: useNavigationAction(
      args.goBack,
      args.flushPendingEditorDraft,
      args.flushPendingEditorDraftImmediately,
      prepareForNavigation,
      finalizeNavigation,
      targetResolvers.resolveBackTargetNodeId,
      markSelectionRequested,
      ensureNodeReady
    ),
    handleGoForward: useNavigationAction(
      args.goForward,
      args.flushPendingEditorDraft,
      args.flushPendingEditorDraftImmediately,
      prepareForNavigation,
      finalizeNavigation,
      targetResolvers.resolveForwardTargetNodeId,
      markSelectionRequested,
      ensureNodeReady
    ),
    handleGoParent: useNavigationAction(
      args.goToParent,
      args.flushPendingEditorDraft,
      args.flushPendingEditorDraftImmediately,
      prepareForNavigation,
      finalizeNavigation,
      targetResolvers.resolveParentTargetNodeId,
      markSelectionRequested,
      ensureNodeReady
    )
  };
}
