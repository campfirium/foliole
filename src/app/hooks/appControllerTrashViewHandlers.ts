import type { BuildControllerLayoutPropsArgs } from './appControllerLayoutProps';

export function createOpenNotesView(args: BuildControllerLayoutPropsArgs) {
  return () => {
    args.runtime.setIsViewingTrashNode(false);
    args.trash.closeTrashView();
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
    args.nav.handleSelectNode(nodeId);
  };
}
