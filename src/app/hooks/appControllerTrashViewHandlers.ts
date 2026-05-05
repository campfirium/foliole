import { pushDebugTrace } from '../../shared/testing/debugBridge';

import type { BuildControllerLayoutPropsArgs } from './appControllerLayoutProps';
import { buildAnchorViewState } from './anchorViewState';
import { requestReadingPositionApply } from './readingPositionRequests';

export function createOpenNotesView(args: BuildControllerLayoutPropsArgs) {
  return () => {
    args.runtime.flushPendingEditorDraft();
    args.runtime.setIsViewingTrashNode(false);
    args.trash.closeTrashView();
    args.virtualView.closeVirtualView();
  };
}

export function createToggleTrashView(args: BuildControllerLayoutPropsArgs, openNotesView: () => void) {
  return () => {
    if (args.trash.isTrashViewOpen) {
      openNotesView();
      return;
    }
    args.runtime.flushPendingEditorDraft();
    args.trash.openTrashView();
  };
}

export function createSelectNode(args: BuildControllerLayoutPropsArgs) {
  return (nodeId: string, focusAnchor = null) => {
    args.runtime.flushPendingEditorDraft();
    args.runtime.setIsViewingTrashNode(false);
    const activeNode = args.ws.activeNodeId ? args.ws.nodesById[args.ws.activeNodeId] : null;
    const inheritedParentAnchor =
      !focusAnchor && activeNode?.parentNodeId === nodeId ? activeNode.anchorLink ?? null : null;
    const effectiveFocusAnchor = focusAnchor ?? inheritedParentAnchor;
    pushDebugTrace('select-node.requested', {
      activeNodeAnchorLink: activeNode?.anchorLink ?? null,
      activeNodeId: activeNode?.id ?? null,
      effectiveFocusAnchor,
      focusAnchor,
      nodeId
    });
    const applyTextAnchorSelection = (targetNodeId: string, anchorLink: typeof effectiveFocusAnchor) => {
      const nextViewState = buildAnchorViewState(anchorLink, args.ws.nodeViewById[targetNodeId], undefined, true);
      if (!nextViewState) {
        return false;
      }
      args.ws.setNodeViewState(targetNodeId, nextViewState);
      requestReadingPositionApply({
        nodeId: targetNodeId,
        reason: 'anchor-navigation',
        runtime: args.runtime,
        selection: nextViewState.selection
      });
      return true;
    };
    if (args.ws.nodesById[nodeId]?.specialKind !== 'virtual') {
      args.virtualView.closeVirtualView();
    }
    if (effectiveFocusAnchor) {
      applyTextAnchorSelection(nodeId, effectiveFocusAnchor);
    }
    args.nav.handleSelectNode(nodeId);
  };
}

export function createToggleVirtualView(args: BuildControllerLayoutPropsArgs, openNotesView: () => void) {
  return () => {
    if (args.virtualView.isVirtualViewOpen) {
      openNotesView();
      return;
    }
    args.runtime.flushPendingEditorDraft();
    args.runtime.setIsViewingTrashNode(false);
    args.trash.closeTrashView();
    args.virtualView.openVirtualView();
  };
}
