import { useCallback } from 'react';
import type { MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { markNodeSelectionRequested } from '../../shared/platform/performanceDiagnosticsProbe';
import type { WorkspaceBrowseRootIntent } from '../../store/workspaceBrowseRoot';
import type { NodeNavigationResult } from '../../store/workspaceNavigation';

import { useBreadcrumbSelectionAction, usePreparedOpenNodeAction } from './usePreparedNodeSelectionActions';
import { useNavigationAction, useSelectNodeAction } from './useWorkspaceNavigationActions';
import { useNavigationTargetResolvers, useNodeDocumentPrefetch } from './useWorkspaceNavigationPrefetchHelpers';

export interface PreparedNavigationDependencies {
  activeNodeContent: string | null;
  activeNodeId: string | null;
  closeContextMenu: () => void;
  editorRef: MutableRefObject<EditorAdapter | null>;
  flushActiveEditorTransaction: (sourceNodeId?: string | null) => boolean;
  flushPendingEditorDraft: () => void;
  flushPendingEditorDraftImmediately: () => Promise<boolean>;
  goBack: () => NodeNavigationResult | null;
  goForward: () => NodeNavigationResult | null;
  goToLastChild: () => NodeNavigationResult | null;
  goToParent: () => NodeNavigationResult | null;
  jumpToAncestorNode: (nodeId: string) => NodeNavigationResult | null;
  nodesById: Record<string, Node>;
  openNode: (nodeId: string, browseRootIntent?: WorkspaceBrowseRootIntent) => NodeNavigationResult | null;
  saveActiveNodeView: (nodeIdOverride?: string | null) => void;
  applyNavigationResult: (result: NodeNavigationResult | null) => void;
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
    args.flushActiveEditorTransaction,
    args.flushPendingEditorDraft,
    args.flushPendingEditorDraftImmediately,
    prepareForNavigation,
    finalizeNavigation,
    markSelectionRequested
  );
  const targetResolvers = useNavigationTargetResolvers();
  const handleSelectBreadcrumbNode = useBreadcrumbSelectionAction(
    args.activeNodeId,
    args.nodesById,
    args.jumpToAncestorNode,
    args.openNode,
    args.flushActiveEditorTransaction,
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
  const shared = {
    ensureNodeReady,
    finalizeNavigation,
    markSelectionRequested,
    prepareForNavigation
  };
  return {
    handleSelectNode: useSelectNodeAction(
      args.activeNodeId,
      args.openNode,
      prepareForNavigation,
      args.flushActiveEditorTransaction,
      args.flushPendingEditorDraft,
      args.flushPendingEditorDraftImmediately,
      finalizeNavigation,
      markSelectionRequested,
      ensureNodeReady,
      openPreparedNode
    ),
    handleSelectBreadcrumbNode,
    handleGoBack: usePreparedDirection(args.goBack, targetResolvers.resolveBackTargetNodeId, args, shared),
    handleGoForward: usePreparedDirection(args.goForward, targetResolvers.resolveForwardTargetNodeId, args, shared),
    handleGoParent: usePreparedDirection(args.goToParent, targetResolvers.resolveParentTargetNodeId, args, shared),
    handleGoToLastChild: usePreparedDirection(
      args.goToLastChild,
      targetResolvers.resolveLastChildTargetNodeId,
      args,
      shared
    )
  };
}

function usePreparedDirection(
  action: () => NodeNavigationResult | null,
  resolveTargetNodeId: () => string | null,
  args: PreparedNavigationDependencies,
  shared: {
    ensureNodeReady: (nodeId: string) => Promise<void>;
    finalizeNavigation: (result: NodeNavigationResult | null) => void;
    markSelectionRequested: (nodeId: string) => void;
    prepareForNavigation: (nodeIdOverride?: string | null) => void;
  }
) {
  return useNavigationAction(
    action,
    args.flushActiveEditorTransaction,
    args.flushPendingEditorDraft,
    args.flushPendingEditorDraftImmediately,
    shared.prepareForNavigation,
    shared.finalizeNavigation,
    resolveTargetNodeId,
    shared.markSelectionRequested,
    shared.ensureNodeReady
  );
}
