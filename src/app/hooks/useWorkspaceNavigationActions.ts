import { useCallback } from 'react';

import { commitActiveNodeRename } from '../../features/nodes/components/nodeRenameCommitCapability';
import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { hasWorkspaceRuntimeRepository } from '../../shared/platform/workspaceRuntimeRepository';
import type { WorkspaceBrowseRootIntent } from '../../store/workspaceBrowseRoot';
import type { NodeNavigationResult } from '../../store/workspaceNavigation';
import { isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';
import { useWorkspaceStore } from '../../store/workspaceStore';

export function useNavigationAction(
  action: () => NodeNavigationResult | null,
  flushActiveEditorTransaction: (sourceNodeId?: string | null) => boolean,
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
    if (!resolveTargetNodeId()) {
      action();
      return;
    }
    if (!flushActiveEditorTransaction(sourceNodeId)) {
      flushPendingEditorDraft();
    }
    if (!await commitActiveNodeRename()) {
      return;
    }
    if (!await flushPendingEditorDraftImmediately()) {
      return;
    }
    const targetNodeId = resolveTargetNodeId();
    if (!targetNodeId) {
      action();
      return;
    }
    markRequested(targetNodeId);
    prepareForNavigation(sourceNodeId);
    const result = action();
    finalize(result);
    void ensureNodeReady(targetNodeId);
  }, [
    action,
    ensureNodeReady,
    finalize,
    flushActiveEditorTransaction,
    flushPendingEditorDraft,
    flushPendingEditorDraftImmediately,
    markRequested,
    prepareForNavigation,
    resolveTargetNodeId
  ]);
}

export function useSelectNodeAction(
  activeNodeId: string | null,
  action: (nodeId: string, browseRootIntent?: WorkspaceBrowseRootIntent) => NodeNavigationResult | null,
  prepareForNavigation: (nodeIdOverride?: string | null) => void,
  flushActiveEditorTransaction: (sourceNodeId?: string | null) => boolean,
  flushPendingEditorDraft: () => void,
  flushPendingEditorDraftImmediately: () => Promise<boolean>,
  finalize: (result: NodeNavigationResult | null) => void,
  markRequested: (nodeId: string) => void,
  ensureNodeReady: (nodeId: string) => Promise<void>,
  openPreparedNode: (
    nodeId: string,
    focusAnchor?: NodeNavigationResult['focusAnchor'],
    browseRootIntent?: WorkspaceBrowseRootIntent
  ) => Promise<void>
) {
  return useCallback(
    async (
      nodeId: string,
      focusAnchor: NodeAnchorLink | null = null,
      browseRootIntent: WorkspaceBrowseRootIntent = 'current-context'
    ) => {
      if (focusAnchor && activeNodeId === nodeId) {
        markRequested(nodeId);
        if (!flushActiveEditorTransaction(activeNodeId)) {
          flushPendingEditorDraft();
        }
        finalize({ focusAnchor, nodeId });
        return;
      }
      const targetNode = useWorkspaceStore.getState().nodesById[nodeId];
      if (targetNode && !isNodeDocumentLoaded(targetNode) && hasWorkspaceRuntimeRepository()) {
        await openPreparedNode(nodeId, focusAnchor, browseRootIntent);
        return;
      }

      markRequested(nodeId);
      if (!flushActiveEditorTransaction(activeNodeId)) {
        flushPendingEditorDraft();
      }
      prepareForNavigation();
      const result = action(nodeId, browseRootIntent);
      finalize(result ? { ...result, focusAnchor } : result);
      void flushPendingEditorDraftImmediately();
      void ensureNodeReady(nodeId);
    },
    [
      action,
      activeNodeId,
      ensureNodeReady,
      finalize,
      flushActiveEditorTransaction,
      flushPendingEditorDraft,
      flushPendingEditorDraftImmediately,
      markRequested,
      openPreparedNode,
      prepareForNavigation
    ]
  );
}
