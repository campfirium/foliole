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
  const targetResolvers = useNavigationTargetResolvers(args.activeNodeId, args.nodesById);
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
    handleGoBack: useNavigationAction(
      args.goBack,
      args.flushActiveEditorTransaction,
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
      args.flushActiveEditorTransaction,
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
      args.flushActiveEditorTransaction,
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
