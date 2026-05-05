import type { BuildControllerLayoutPropsArgs } from './appControllerLayoutProps';

export function createLayoutNav(args: BuildControllerLayoutPropsArgs) {
  return {
    onGoBack: args.nav.handleGoBack,
    onGoForward: args.nav.handleGoForward,
    onGoParent: args.nav.handleGoParent,
    onSelectBreadcrumbNode: args.nav.handleSelectBreadcrumbNode,
    onSelectNode: args.nav.handleSelectNode
  };
}

export function createSelectTrashNodeHandler(args: BuildControllerLayoutPropsArgs) {
  return (nodeId: string) => {
    args.runtime.setIsViewingTrashNode(true);
    args.trash.openTrashView();
    args.trash.setSelectedTrashNodeId(nodeId);
  };
}
