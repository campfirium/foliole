import { useCallback } from 'react';

import { isPdfAnchorLocator } from '../../features/nodes/model/nodeTypes';
import type { NodeNavigationResult } from '../../store/workspaceNavigation';

import { buildAnchorViewState } from './anchorViewState';
import type { useWorkspaceSelectors } from './appControllerState';
import { requestReadingPositionApply } from './readingPositionRequests';
import type { useAppRuntime } from './useAppRuntime';

const HIGHLIGHT_JUMP_VIEWPORT_RATIO = 0.24;

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
            selection: { from: 0, to: 0 }
          };
      if (!nextViewState) {
        return false;
      }
      requestReadingPositionApply({
        nodeId: result.nodeId,
        reason: result.focusAnchor ? 'anchor-navigation' : 'node-navigation',
        runtime,
        selection: {
          from: nextViewState.selection.from,
          to: nextViewState.selection.from
        },
        targetViewportRatio: result.focusAnchor ? HIGHLIGHT_JUMP_VIEWPORT_RATIO : undefined
      });
      return true;
    },
    [nodeViewById, runtime, setNodeViewState]
  );

  return {
    applyNavigationReadingPosition
  };
}
