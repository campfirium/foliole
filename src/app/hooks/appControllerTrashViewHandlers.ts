import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { pushDebugTrace } from '../../shared/diagnostics/debugTrace';

import type { BuildControllerLayoutPropsArgs } from './appControllerLayoutProps';

export function createOpenNotesView(args: BuildControllerLayoutPropsArgs) {
  return () => {
    args.runtime.flushPendingEditorDraft();
    args.runtime.setIsViewingTrashNode(false);
    args.trash.closeTrashView();
    args.externalView.closeExternalView();
    args.virtualView.restoreBrowseView();
  };
}

export function createOpenReviewView(args: BuildControllerLayoutPropsArgs) {
  return () => {
    args.runtime.flushPendingEditorDraft();
    args.runtime.setIsViewingTrashNode(false);
    args.trash.closeTrashView();
    args.externalView.closeExternalView();
    args.virtualView.closeVirtualView();
  };
}

export function createToggleTrashView(args: BuildControllerLayoutPropsArgs) {
  return () => {
    args.runtime.flushPendingEditorDraft();
    args.runtime.setIsViewingTrashNode(true);
    args.externalView.closeExternalView();
    args.virtualView.closeVirtualView();
    args.trash.openTrashView();
  };
}

export function createSelectNode(args: BuildControllerLayoutPropsArgs) {
  return (nodeId: string, focusAnchor: NodeAnchorLink | null = null) => {
    args.runtime.flushPendingEditorDraft();
    args.runtime.setIsViewingTrashNode(false);
    args.trash.closeTrashView();
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
    const selectedNode = args.ws.nodesById[nodeId];
    if (selectedNode?.kind === 'folder') {
      args.ws.setBrowseRootNode(nodeId);
    }
    if (selectedNode?.specialKind === 'virtual' || selectedNode?.specialKind === 'virtual-root') {
      args.virtualView.openVirtualView(nodeId);
    } else if (selectedNode?.kind === 'folder') {
      args.virtualView.closeVirtualView();
    } else {
      args.virtualView.restoreBrowseView();
    }
    args.externalView.closeExternalView();
    args.nav.handleSelectNode(nodeId, effectiveFocusAnchor);
  };
}

export function createToggleVirtualView(args: BuildControllerLayoutPropsArgs) {
  return (nodeId?: string) => {
    args.runtime.flushPendingEditorDraft();
    args.runtime.setIsViewingTrashNode(false);
    args.externalView.closeExternalView();
    args.trash.closeTrashView();
    args.virtualView.openVirtualView(nodeId);
  };
}

export function createOpenExternalSelection(args: BuildControllerLayoutPropsArgs) {
  return (selection: Parameters<BuildControllerLayoutPropsArgs['externalView']['openExternalSelection']>[0]) => {
    args.runtime.flushPendingEditorDraft();
    args.runtime.setIsViewingTrashNode(false);
    args.trash.closeTrashView();
    args.virtualView.closeVirtualView();
    args.externalView.openExternalSelection(selection);
  };
}
