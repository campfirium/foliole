import { isPdfAnchorLocator } from '../../features/nodes/model/nodeTypes';
import { requestPdfAnchorJump } from '../../features/pdf/model/pdfSystemBridge';

import type { BuildControllerLayoutPropsArgs } from './appControllerLayoutProps';

export function createOpenNotesView(args: BuildControllerLayoutPropsArgs) {
  return () => {
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
    args.trash.openTrashView();
  };
}

export function createSelectNode(args: BuildControllerLayoutPropsArgs) {
  return (nodeId: string) => {
    args.runtime.setIsViewingTrashNode(false);
    const selectedNode = args.ws.nodesById[nodeId];
    if (
      (selectedNode?.anchorLink?.kind === 'highlight' || selectedNode?.anchorLink?.kind === 'cloze') &&
      selectedNode.parentNodeId
    ) {
      args.virtualView.closeVirtualView();
      if (isPdfAnchorLocator(selectedNode.anchorLink.locator)) {
        args.nav.handleSelectNode(selectedNode.parentNodeId);
        requestPdfAnchorJump(selectedNode.parentNodeId, selectedNode.anchorLink.locator);
        return;
      }
      args.nav.handleSelectNode(selectedNode.parentNodeId, selectedNode.anchorLink);
      return;
    }
    if (args.ws.nodesById[nodeId]?.specialKind !== 'virtual') {
      args.virtualView.closeVirtualView();
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
    args.runtime.setIsViewingTrashNode(false);
    args.trash.closeTrashView();
    args.virtualView.openVirtualView();
  };
}
