import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { resolveAncestorAnchorLink } from '../../store/workspaceNavigation';

import type { BuildControllerLayoutPropsArgs } from './appControllerLayoutProps';

export function createLayoutNav(
  args: BuildControllerLayoutPropsArgs,
  onSelectNode: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void
) {
  return {
    onGoBack: () => {
      if (args.externalView.isExternalViewOpen && args.externalView.goBack()) {
        return;
      }
      args.nav.handleGoBack();
    },
    onGoForward: () => {
      if (args.externalView.canGoForward && args.externalView.goForward()) {
        return;
      }
      args.nav.handleGoForward();
    },
    onGoParent: args.nav.handleGoParent,
    onSelectBreadcrumbNode: (nodeId: string) => {
      const activeNodeId = args.ws.activeNodeId;
      if (!activeNodeId || activeNodeId === nodeId) {
        args.nav.handleSelectBreadcrumbNode(nodeId);
        return;
      }
      const ancestorTarget = resolveAncestorAnchorLink(activeNodeId, nodeId, args.ws.nodesById);
      if (!ancestorTarget.isAncestor || !ancestorTarget.focusAnchor) {
        args.nav.handleSelectBreadcrumbNode(nodeId);
        return;
      }
      onSelectNode(nodeId, ancestorTarget.focusAnchor);
    },
    onSelectNode: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => onSelectNode(nodeId, focusAnchor),
    onSelectNodeInVirtualView: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => {
      args.runtime.flushPendingEditorDraft();
      args.runtime.setIsViewingTrashNode(false);
      args.trash.closeTrashView();
      args.externalView.closeExternalView();
      args.nav.handleSelectNode(nodeId, focusAnchor ?? null);
    },
    shouldSuppressNavigationSelectionRestore: args.nav.shouldSuppressSelectionRestore
  };
}

export function resolveLayoutCanGoBack(args: BuildControllerLayoutPropsArgs) {
  return args.externalView.isExternalViewOpen ? args.externalView.canGoBack || args.nav.canGoBack : args.nav.canGoBack;
}

export function resolveLayoutCanGoForward(args: BuildControllerLayoutPropsArgs) {
  return args.externalView.canGoForward || args.nav.canGoForward;
}

export function createSelectTrashNodeHandler(args: BuildControllerLayoutPropsArgs) {
  return (nodeId: string) => {
    args.runtime.flushPendingEditorDraft();
    args.runtime.setIsViewingTrashNode(true);
    args.trash.openTrashView();
    args.trash.setSelectedTrashNodeId(nodeId);
  };
}
