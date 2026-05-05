import { useCallback } from 'react';

import { isPdfAnchorLocator } from '../../features/nodes/model/nodeTypes';
import type { NodeNavigationResult } from '../../store/workspaceNavigation';

import { buildAnchorViewState } from './anchorViewState';
import type { useWorkspaceSelectors } from './appControllerState';
import { requestReadingPositionApply } from './readingPositionRequests';
import type { useAppRuntime } from './useAppRuntime';

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
      if (!nextViewState.selection) {
        return true;
      }
      requestReadingPositionApply({
        nodeId: result.nodeId,
        reason: result.focusAnchor ? 'anchor-navigation' : 'node-navigation',
        runtime,
        selection: {
          from: nextViewState.selection.from,
          to: nextViewState.selection.from
        },
        targetViewportMode: result.focusAnchor ? 'center' : undefined
      });
      return true;
    },
    [nodeViewById, runtime, setNodeViewState]
  );

  return {
    applyNavigationReadingPosition
  };
}
