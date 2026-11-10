import { useCallback, useEffect, useRef } from 'react';

import { getPdfAnchorLocators, type Node } from '../../features/nodes/model/nodeTypes';
import { resolveTextAnchorLinkInContent } from '../../features/nodes/model/textAnchorResolution';
import { definedProps } from '../../shared/lib/definedProps';
import type { NodeNavigationResult } from '../../store/workspaceNavigation';
import type { NodeViewState } from '../../store/workspaceStore';

import { buildAnchorViewState } from './anchorViewState';
import type { useWorkspaceSelectors } from './appControllerState';
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

export function useNavigationReadingPosition(
  runtime: ReturnType<typeof useAppRuntime>,
  nodeViewById: ReturnType<typeof useWorkspaceSelectors>['nodeViewById'],
  setNodeViewState: ReturnType<typeof useWorkspaceSelectors>['setNodeViewState'],
  nodesById: Record<string, Node> = {}
) {
  const applyNavigationReadingPosition = useCallback(
    (result: NodeNavigationResult | null) => {
      if (!result) {
        return false;
      }
      if (result.focusAnchor && (getPdfAnchorLocators(result.focusAnchor.locator).length > 0)) {
        return false;
      }
      const targetNode = nodesById[result.nodeId];
      const focusAnchor = result.focusAnchor && targetNode
        ? resolveTextAnchorLinkInContent(result.focusAnchor, targetNode.content)
        : result.focusAnchor;
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
  const restoredActiveNodeIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isWorkspaceHydrated || !activeNodeId) {
      restoredActiveNodeIdRef.current = null;
      return;
    }
    if (restoredActiveNodeIdRef.current === activeNodeId) {
      return;
    }
    restoredActiveNodeIdRef.current = activeNodeId;
    const currentCommand = runtime.readingPositionRestoreCommandRef.current;
    if (currentCommand.nodeId === activeNodeId && currentCommand.command) {
      return;
    }
    const viewState = nodeViewById[activeNodeId];
    if (!viewState || !hasRestorableNodeViewState(viewState)) {
      return;
    }
    requestReadingPositionApply({
      nodeId: activeNodeId,
      reason: 'active-node-restore',
      runtime,
      ...resolveViewRestore(viewState)
    });
  }, [activeNodeId, isWorkspaceHydrated, nodeViewById, runtime]);
}
