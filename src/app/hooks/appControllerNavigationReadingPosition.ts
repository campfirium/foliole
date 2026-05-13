import { useCallback, useEffect, useRef } from 'react';

import { isPdfAnchorLocator } from '../../features/nodes/model/nodeTypes';
import { definedProps } from '../../shared/lib/definedProps';
import type { NodeNavigationResult } from '../../store/workspaceNavigation';
import type { NodeViewState } from '../../store/workspaceStore';

import { buildAnchorViewState } from './anchorViewState';
import type { useWorkspaceSelectors } from './appControllerState';
import { requestReadingPositionApply } from './readingPositionRequests';
import type { useAppRuntime } from './useAppRuntime';

function hasRestorableNodeViewState(viewState: NodeViewState | undefined) {
  return Boolean(viewState?.selection || (typeof viewState?.scrollTop === 'number' && viewState.scrollTop > 0));
}

function toCollapsedSelection(viewState: NodeViewState) {
  return viewState.selection
    ? {
        from: viewState.selection.from,
        to: viewState.selection.from
      }
    : null;
}

export function useNavigationReadingPosition(
  runtime: ReturnType<typeof useAppRuntime>,
  nodeViewById: ReturnType<typeof useWorkspaceSelectors>['nodeViewById'],
  setNodeViewState: ReturnType<typeof useWorkspaceSelectors>['setNodeViewState']
) {
  const applyNavigationReadingPosition = useCallback(
    (result: NodeNavigationResult | null) => {
      if (!result) {
        return false;
      }
      if (result.focusAnchor && isPdfAnchorLocator(result.focusAnchor.locator)) {
        return false;
      }
      const nextViewState = result.focusAnchor
        ? buildAnchorViewState(result.focusAnchor, nodeViewById[result.nodeId], 0, true)
        : nodeViewById[result.nodeId] ?? {
            scrollTop: 0,
            selection: null
          };
      if (!nextViewState) {
        return false;
      }
      requestReadingPositionApply({
        nodeId: result.nodeId,
        reason: result.focusAnchor ? 'anchor-navigation' : 'node-navigation',
        runtime,
        scrollTop: nextViewState.scrollTop,
        selection: nextViewState.selection
          ? {
              from: nextViewState.selection.from,
              to: nextViewState.selection.from
            }
          : null,
        ...definedProps({ targetViewportMode: result.focusAnchor ? ('center' as const) : undefined })
      });
      return true;
    },
    [nodeViewById, runtime, setNodeViewState]
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
      scrollTop: viewState.scrollTop,
      selection: toCollapsedSelection(viewState)
    });
  }, [activeNodeId, isWorkspaceHydrated, nodeViewById, runtime]);
}
