import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { resolveAncestorAnchorLink } from '../../store/workspaceNavigation';

import type { BuildControllerLayoutPropsArgs } from './appControllerLayoutProps';

export function createLayoutNav(
  args: BuildControllerLayoutPropsArgs,
  onSelectNode: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void
) {
  return {
    onGoBack: args.nav.handleGoBack,
    onGoForward: args.nav.handleGoForward,
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
    shouldSuppressNavigationSelectionRestore: args.nav.shouldSuppressSelectionRestore
  };
}

export function createSelectTrashNodeHandler(args: BuildControllerLayoutPropsArgs) {
  return (nodeId: string) => {
    args.runtime.flushPendingEditorDraft();
    args.runtime.setIsViewingTrashNode(true);
    args.trash.openTrashView();
    args.trash.setSelectedTrashNodeId(nodeId);
  };
}
