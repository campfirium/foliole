import type { WorkspaceLayoutProps } from '../components/WorkspaceLayout';

import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import { createVirtualFolderCommand } from './appVirtualFolderCommand';

export function createPaletteCreationActions(args: {
  layoutProps: WorkspaceLayoutProps;
  trash: ReturnType<typeof useWorkspaceControllerState>['trash'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  const createDirectNode = (kind: 'folder' | 'topic' | 'item') => () => {
    args.trash.closeTrashView();
    args.ws.createRootNode('', kind);
  };
  return {
    createFolder: createDirectNode('folder'),
    createItem: createDirectNode('item'),
    createTopic: createDirectNode('topic'),
    createVirtualFolder: createVirtualFolderCommand({
      createVirtualNode: args.ws.createVirtualNode,
      onOpenVirtualView: args.layoutProps.virtualView.onOpenVirtualView,
      onSelectNodeInVirtualView: args.layoutProps.navigation.onSelectNodeInVirtualView
    })
  };
}
