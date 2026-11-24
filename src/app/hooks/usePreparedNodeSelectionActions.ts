import { useCallback } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  markNodeDocumentLoadResolved,
  markNodeDocumentLoadStarted,
  markNodeDocumentMerged
} from '../../shared/platform/performanceDiagnosticsProbe';
import { hasWorkspaceRuntimeRepository } from '../../shared/platform/workspaceRuntimeRepository';
import type { WorkspaceBrowseRootIntent } from '../../store/workspaceBrowseRoot';
import { resolveAncestorAnchorLink, type NodeNavigationResult } from '../../store/workspaceNavigation';
import { isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { loadDesktopNodeDocument } from './desktopNodeDocumentLoad';
import { isNavigationGenerationCurrent, nextNavigationGeneration } from './navigationRequestGeneration';

// A slow or stuck read must not leave the click without any response: past this wait the target opens as before and
// shows its loading state while the read continues.
export const PREPARED_OPEN_MAX_WAIT_MS = 400;

async function waitForPreparedBody(load: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => { timer = setTimeout(resolve, PREPARED_OPEN_MAX_WAIT_MS); });
  try {
    await Promise.race([load, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// The target is not active yet, so without keepWarm the renderer boundary would drop its body again.
function createPreparedLoadOptions(nodeId: string, isCurrent: () => boolean) {
  return {
    keepWarm: true,
    onDocumentMerged: (document: { content: string }) => {
      if (isCurrent()) markNodeDocumentMerged(nodeId, `content:${document.content.length}`);
    },
    onLoadResolved: () => {
      if (isCurrent()) markNodeDocumentLoadResolved(nodeId);
    },
    onLoadStarted: () => {
      if (isCurrent()) markNodeDocumentLoadStarted(nodeId);
    }
  };
}

export function usePreparedOpenNodeAction(
  action: (nodeId: string, browseRootIntent?: WorkspaceBrowseRootIntent) => NodeNavigationResult | null,
  flushActiveEditorTransaction: (sourceNodeId?: string | null) => boolean,
  flushPendingEditorDraft: () => void,
  flushPendingEditorDraftImmediately: () => Promise<boolean>,
  prepareForNavigation: (nodeIdOverride?: string | null) => void,
  finalize: (result: NodeNavigationResult | null) => void,
  markRequested: (nodeId: string) => void
) {
  return useCallback(
    async (
      nodeId: string,
      focusAnchor: NodeNavigationResult['focusAnchor'] = null,
      browseRootIntent: WorkspaceBrowseRootIntent = 'current-context'
    ) => {
      const requestToken = nextNavigationGeneration();
      const sourceNodeId = useWorkspaceStore.getState().activeNodeId;
      markRequested(nodeId);
      const flushDraft = () => {
        if (!flushActiveEditorTransaction(useWorkspaceStore.getState().activeNodeId)) {
          flushPendingEditorDraft();
        }
      };
      flushDraft();
      const openTarget = () => {
        prepareForNavigation();
        const result = action(nodeId, browseRootIntent);
        finalize(result ? { ...result, focusAnchor } : result);
        void flushPendingEditorDraftImmediately();
      };
      const targetNode = useWorkspaceStore.getState().nodesById[nodeId];
      if (!targetNode || isNodeDocumentLoaded(targetNode) || !hasWorkspaceRuntimeRepository()) {
        openTarget();
        return;
      }

      // Keep the current note and editor on screen until the target body is ready, so the editor is never swapped
      // for a loading placeholder. Only the newest request may switch; a failed read still opens the target so its
      // own retry state is shown.
      void flushPendingEditorDraftImmediately();
      const isCurrent = () => isNavigationGenerationCurrent(requestToken)
        && useWorkspaceStore.getState().activeNodeId === sourceNodeId;
      await waitForPreparedBody(loadDesktopNodeDocument(nodeId, createPreparedLoadOptions(nodeId, isCurrent), isCurrent));
      if (!isCurrent()) return;
      // Typing may have continued in the old note while the body loaded.
      flushDraft();
      openTarget();
    },
    [action, finalize, flushActiveEditorTransaction, flushPendingEditorDraft, flushPendingEditorDraftImmediately, markRequested, prepareForNavigation]
  );
}

export function useBreadcrumbSelectionAction(
  activeNodeId: string | null,
  nodesById: Record<string, Node>,
  jumpToAncestorNode: (nodeId: string) => NodeNavigationResult | null,
  openNode: (nodeId: string, browseRootIntent?: WorkspaceBrowseRootIntent) => NodeNavigationResult | null,
  flushActiveEditorTransaction: (sourceNodeId?: string | null) => boolean,
  flushPendingEditorDraft: () => void,
  flushPendingEditorDraftImmediately: () => Promise<boolean>,
  prepareForNavigation: (nodeIdOverride?: string | null) => void,
  finalizeNavigation: (result: NodeNavigationResult | null) => void,
  markSelectionRequested: (nodeId: string) => void,
  ensureNodeReady: (nodeId: string) => Promise<void>,
  openPreparedNode: (
    nodeId: string,
    focusAnchor?: NodeNavigationResult['focusAnchor'],
    browseRootIntent?: WorkspaceBrowseRootIntent
  ) => Promise<void>
) {
  return useCallback(
    async (nodeId: string) => {
      if (activeNodeId && activeNodeId !== nodeId) {
        const ancestorTarget = resolveAncestorAnchorLink(activeNodeId, nodeId, nodesById);
        const targetNode = useWorkspaceStore.getState().nodesById[nodeId];
        if (ancestorTarget.isAncestor && targetNode && !isNodeDocumentLoaded(targetNode) && hasWorkspaceRuntimeRepository()) {
          await openPreparedNode(nodeId, ancestorTarget.focusAnchor);
          return;
        }
      }

      const targetNode = useWorkspaceStore.getState().nodesById[nodeId];
      if (targetNode && !isNodeDocumentLoaded(targetNode) && hasWorkspaceRuntimeRepository()) {
        await openPreparedNode(nodeId);
        return;
      }

      nextNavigationGeneration();
      markSelectionRequested(nodeId);
      if (!flushActiveEditorTransaction(activeNodeId)) {
        flushPendingEditorDraft();
      }
      prepareForNavigation(activeNodeId);
      const result = jumpToAncestorNode(nodeId) ?? openNode(nodeId);
      finalizeNavigation(result);
      void flushPendingEditorDraftImmediately();
      void ensureNodeReady(nodeId);
    },
    [
      activeNodeId,
      ensureNodeReady,
      finalizeNavigation,
      flushActiveEditorTransaction,
      jumpToAncestorNode,
      markSelectionRequested,
      nodesById,
      openNode,
      openPreparedNode,
      prepareForNavigation,
      flushPendingEditorDraft,
      flushPendingEditorDraftImmediately,
    ]
  );
}
