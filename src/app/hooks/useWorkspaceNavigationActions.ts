import { useCallback } from 'react';

import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { hasWorkspaceRuntimeRepository } from '../../shared/platform/workspaceRuntimeRepository';
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
    const targetNodeId = resolveTargetNodeId();
    if (targetNodeId) {
      markRequested(targetNodeId);
    }
    if (!flushActiveEditorTransaction(sourceNodeId)) {
      flushPendingEditorDraft();
    }
    prepareForNavigation(sourceNodeId);
    const result = action();
    finalize(result);
    void flushPendingEditorDraftImmediately();
    if (targetNodeId) {
      void ensureNodeReady(targetNodeId);
    }
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
  action: (nodeId: string) => NodeNavigationResult | null,
  prepareForNavigation: (nodeIdOverride?: string | null) => void,
  flushActiveEditorTransaction: (sourceNodeId?: string | null) => boolean,
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
        if (!flushActiveEditorTransaction(activeNodeId)) {
          flushPendingEditorDraft();
        }
        finalize({ focusAnchor, nodeId });
        return;
      }
      const targetNode = useWorkspaceStore.getState().nodesById[nodeId];
      if (targetNode && !isNodeDocumentLoaded(targetNode) && hasWorkspaceRuntimeRepository()) {
        await openPreparedNode(nodeId, focusAnchor);
        return;
      }

      markRequested(nodeId);
      if (!flushActiveEditorTransaction(activeNodeId)) {
        flushPendingEditorDraft();
      }
      prepareForNavigation();
      const result = action(nodeId);
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
