import { useCallback } from 'react';
import type { MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { Node, NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { getRuntimeInvoke } from '../../shared/platform/bridge';
import {
  markNodeDocumentLoadResolved,
  markNodeDocumentLoadStarted,
  markNodeDocumentMerged,
  markNodeSelectionRequested
} from '../../shared/platform/performanceDiagnosticsProbe';
import type { NodeNavigationResult } from '../../store/workspaceNavigation';
import { ensureWorkspaceNodeDocumentReady } from '../../store/workspaceNodePreparation';
import { isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { useBreadcrumbSelectionAction, usePreparedOpenNodeAction } from './usePreparedNodeSelectionActions';

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
    await flushPendingEditorDraftImmediately();
    prepareForNavigation(sourceNodeId);
    const result = action();
    finalize(result);
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
      if (targetNode && !isNodeDocumentLoaded(targetNode) && getRuntimeInvoke()) {
        await openPreparedNode(nodeId, focusAnchor);
        return;
      }

      markRequested(nodeId);
      flushPendingEditorDraft();
      await flushPendingEditorDraftImmediately();
      prepareForNavigation();
      const result = action(nodeId);
      finalize(result ? { ...result, focusAnchor } : result);
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

function useNavigationTargetResolvers(activeNodeId: string | null, nodesById: Record<string, Node>) {
  const resolveBackTargetNodeId = useCallback(() => {
    const backStack = useWorkspaceStore.getState().navigation.backStack;
    return backStack[backStack.length - 1] ?? null;
  }, []);

  const resolveForwardTargetNodeId = useCallback(() => {
    return useWorkspaceStore.getState().navigation.forwardStack[0] ?? null;
  }, []);

  const resolveParentTargetNodeId = useCallback(() => {
    if (!activeNodeId) {
      return null;
    }
    return nodesById[activeNodeId]?.parentNodeId ?? null;
  }, [activeNodeId, nodesById]);

  return {
    resolveBackTargetNodeId,
    resolveForwardTargetNodeId,
    resolveParentTargetNodeId
  };
}

function useNodeDocumentPrefetch() {
  return useCallback(async (nodeId: string) => {
    const targetNode = useWorkspaceStore.getState().nodesById[nodeId];
    if (!targetNode || isNodeDocumentLoaded(targetNode)) {
      return;
    }

    await ensureWorkspaceNodeDocumentReady(nodeId, {
      keepWarm: true,
      onDocumentMerged: (document) => {
        markNodeDocumentMerged(nodeId, `content:${document.content.length}`);
      },
      onLoadResolved: () => {
        markNodeDocumentLoadResolved(nodeId);
      },
      onLoadStarted: () => {
        markNodeDocumentLoadStarted(nodeId);
      }
    });
  }, []);
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
      args.editorRef.current = null;
    },
    [args.editorRef, args.saveActiveNodeView]
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
