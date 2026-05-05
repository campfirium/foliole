import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { pushDebugTrace } from '../../shared/testing/debugBridge';

import type { BuildControllerLayoutPropsArgs } from './appControllerLayoutProps';

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
    args.runtime.setIsViewingTrashNode(true);
    args.trash.openTrashView();
  };
}

export function createSelectNode(args: BuildControllerLayoutPropsArgs) {
  return (nodeId: string, focusAnchor: NodeAnchorLink | null = null) => {
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
    if (args.ws.nodesById[nodeId]?.specialKind !== 'virtual') {
      args.virtualView.closeVirtualView();
    }
    args.nav.handleSelectNode(nodeId, effectiveFocusAnchor);
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
