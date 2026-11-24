import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

import { getPdfAnchorLocators, type Node } from '../../features/nodes/model/nodeTypes';
import { resolveTextAnchorLinkInContent } from '../../features/nodes/model/textAnchorResolution';
import { definedProps } from '../../shared/lib/definedProps';
import { logRuntimeWarning } from '../../shared/platform/runtimeLogging';
import { hasWorkspaceRuntimeRepository, loadReadingResumeFromRuntime } from '../../shared/platform/workspaceRuntimeRepository';
import type { NodeNavigationResult } from '../../store/workspaceNavigation';
import { isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';
import { useWorkspaceStore, type NodeViewState } from '../../store/workspaceStore';

import { buildAnchorViewState } from './anchorViewState';
import { flushVisibleReadingJump } from './appControllerSaveActiveNodeView';
import type { useWorkspaceSelectors } from './appControllerState';
import { currentNavigationGeneration, isNavigationGenerationCurrent } from './navigationRequestGeneration';
import { requestReadingPositionApply } from './readingPositionRequests';
import type { useAppRuntime } from './useAppRuntime';

function hasRestorableNodeViewState(viewState: NodeViewState | undefined) {
  return Boolean(viewState?.readingOffset !== undefined || viewState?.selection || (typeof viewState?.scrollTop === 'number' && viewState.scrollTop > 0));
}

function toCollapsedSelection(viewState: NodeViewState) {
  return viewState.selection
    ? {
        from: viewState.selection.from,
        to: viewState.selection.from
      }
    : null;
}

function resolveViewRestore(viewState: NodeViewState, targetViewportMode?: 'center') {
  if (!targetViewportMode && viewState.readingOffset !== undefined) {
    const position = viewState.readingOffset;
    return { selection: { from: position, to: position }, targetViewportMode: 'reading-position' as const };
  }
  return {
    scrollTop: viewState.scrollTop,
    selection: toCollapsedSelection(viewState),
    ...definedProps({ targetViewportMode })
  };
}

type DeferredAnchorNavigation = {
  generation: number;
  libraryScope: ReturnType<typeof useWorkspaceStore.getState>['libraryScope'];
  result: NodeNavigationResult;
};

function useRevealLoadedAnchor(
  pending: { current: DeferredAnchorNavigation | null },
  apply: (result: NodeNavigationResult | null) => boolean
) {
  const activeNodeId = useWorkspaceStore(state => state.activeNodeId);
  const libraryScope = useWorkspaceStore(state => state.libraryScope);
  const isLoaded = useWorkspaceStore(state => isNodeDocumentLoaded(state.nodesById[state.activeNodeId ?? '']));
  useLayoutEffect(() => {
    const request = pending.current;
    if (!request) return;
    if (request.result.nodeId !== activeNodeId || request.libraryScope !== libraryScope ||
      !isNavigationGenerationCurrent(request.generation)) {
      pending.current = null;
    } else if (isLoaded) {
      apply(request.result);
    }
  }, [activeNodeId, apply, isLoaded, libraryScope, pending]);
}

export function useNavigationReadingPosition(
  runtime: ReturnType<typeof useAppRuntime>,
  nodeViewById: ReturnType<typeof useWorkspaceSelectors>['nodeViewById'],
  setNodeViewState: ReturnType<typeof useWorkspaceSelectors>['setNodeViewState'],
  nodesById: Record<string, Node> = {}
) {
  const pending = useRef<DeferredAnchorNavigation | null>(null);
  const applyNavigationReadingPosition = useCallback(
    (result: NodeNavigationResult | null) => {
      pending.current = null;
      if (!result) {
        return false;
      }
      if (result.focusAnchor && (getPdfAnchorLocators(result.focusAnchor.locator).length > 0)) {
        return false;
      }
      const workspace = useWorkspaceStore.getState();
      const targetNode = workspace.nodesById[result.nodeId] ?? nodesById[result.nodeId];
      if (result.focusAnchor && targetNode && !isNodeDocumentLoaded(targetNode) && hasWorkspaceRuntimeRepository()) {
        pending.current = { result, generation: currentNavigationGeneration(), libraryScope: workspace.libraryScope };
        return true;
      }
      const focusAnchor = result.focusAnchor && targetNode
        ? resolveTextAnchorLinkInContent(result.focusAnchor, targetNode.content)
        : result.focusAnchor;
      if (!focusAnchor && hasWorkspaceRuntimeRepository()) return true;
      const nextViewState = focusAnchor
        ? buildAnchorViewState(focusAnchor, nodeViewById[result.nodeId], 0, true)
        : nodeViewById[result.nodeId] ?? {
            scrollTop: 0,
            selection: null
          };
      if (!nextViewState) {
        return false;
      }
      requestReadingPositionApply({
        nodeId: result.nodeId,
        reason: focusAnchor ? 'anchor-navigation' : 'node-navigation',
        runtime,
        ...resolveViewRestore(nextViewState, focusAnchor ? 'center' : undefined)
      });
      return true;
    },
    [nodeViewById, nodesById, runtime, setNodeViewState]
  );

  useRevealLoadedAnchor(pending, applyNavigationReadingPosition);

  return {
    applyNavigationReadingPosition
  };
}

export function useActiveNodeReadingPositionRestore(
  runtime: ReturnType<typeof useAppRuntime>,
  activeNodeId: string | null,
  nodeViewById: ReturnType<typeof useWorkspaceSelectors>['nodeViewById'],
  isWorkspaceHydrated: boolean
) {
  const latestViews = useRef(nodeViewById);
  latestViews.current = nodeViewById;
  const latestRuntime = useRef(runtime);
  latestRuntime.current = runtime;

  useEffect(() => {
    const refs = latestRuntime.current;
    if (refs.readingResumeContextRef) refs.readingResumeContextRef.current = null;
    if (refs.readingResumeMovedNodeIdRef && refs.readingResumeMovedNodeIdRef.current !== activeNodeId) {
      refs.readingResumeMovedNodeIdRef.current = null;
    }
    if (!isWorkspaceHydrated || !activeNodeId) return;

    function restore(viewState: NodeViewState | undefined, nodeId: string) {
      const currentCommand = refs.readingPositionRestoreCommandRef.current;
      if (currentCommand.nodeId === nodeId && currentCommand.command) return;
      if (!viewState || !hasRestorableNodeViewState(viewState)) return;
      requestReadingPositionApply({
        nodeId, reason: 'active-node-restore', runtime: refs, ...resolveViewRestore(viewState)
      });
    }

    if (!hasWorkspaceRuntimeRepository()) {
      restore(latestViews.current[activeNodeId], activeNodeId);
      return;
    }

    let current = true;
    const explicitRestore = refs.readingPositionRestoreCommandRef.current;
    const hasExplicitRestore = explicitRestore.nodeId === activeNodeId && Boolean(explicitRestore.command);
    const requestSequence = refs.readingPositionRestoreCommandSeqRef.current;
    const canRestore = () => current && !hasExplicitRestore &&
      requestSequence === refs.readingPositionRestoreCommandSeqRef.current;
    void loadReadingResumeFromRuntime(activeNodeId).then(result => {
      if (!current) return;
      if (refs.readingResumeContextRef) refs.readingResumeContextRef.current = result ?? null;
      if (!refs.readingPositionSyncRef.current.state) flushVisibleReadingJump(refs, activeNodeId);
      if (!canRestore()) return;
      const local = latestViews.current[activeNodeId];
      restore(result?.offset != null ? { scrollTop: 0, selection: null, readingOffset: result.offset } : local, activeNodeId);
    }).catch(error => {
      if (!current) return;
      logRuntimeWarning('reading position lookup failed', {
        area: 'persistence', action: 'load_reading_resume', error
      });
      if (canRestore()) restore(latestViews.current[activeNodeId], activeNodeId);
    });
    return () => { current = false; };
  }, [activeNodeId, isWorkspaceHydrated]);
}
