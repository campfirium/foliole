import { INBOX_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { WorkspaceLayoutProps } from '../components/WorkspaceLayout';

import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import { createVirtualFolderCommand } from './appVirtualFolderCommand';
import { runNodeCreationWithEditorFocus } from './runNodeCreationWithEditorFocus';

export function createPaletteCreationActions(args: {
  externalView: ReturnType<typeof useWorkspaceControllerState>['externalView'];
  layoutProps: WorkspaceLayoutProps;
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  trash: ReturnType<typeof useWorkspaceControllerState>['trash'];
  virtualView: ReturnType<typeof useWorkspaceControllerState>['virtualView'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  const createDirectNode = (kind: 'folder' | 'topic' | 'item') => async () => {
    args.trash.closeTrashView();
    if (kind !== 'topic') return args.ws.createRootNode('', kind);
    return runNodeCreationWithEditorFocus({ create: () => args.ws.createRootNode('', kind),
      focus: () => args.layoutProps.document.editorAdapterRef.current?.focus() });
  };
  const createTopic = async () => {
    const browseRoot = args.ws.nodesById[args.ws.browseRootNodeId];
    const hasIncompatibleSurface = args.trash.isTrashViewOpen || args.externalView.isExternalViewOpen;
    const canCreateInCurrentFolder =
      !hasIncompatibleSurface &&
      browseRoot?.kind === 'folder' &&
      !browseRoot.specialKind &&
      !args.ws.trashedNodeIds.includes(browseRoot.id);
    const isViewingInbox =
      !hasIncompatibleSurface &&
      browseRoot?.id === INBOX_NODE_ID &&
      browseRoot.specialKind === 'inbox';
    return runNodeCreationWithEditorFocus({
      create: () => canCreateInCurrentFolder
        ? args.ws.createChildNode(browseRoot.id, '', 'topic')
        : args.ws.createRootNode('', 'topic'),
      focus: () => args.layoutProps.document.editorAdapterRef.current?.focus(),
      prepareFocus: () => {
        if (canCreateInCurrentFolder || isViewingInbox) return false;
        args.runtime.setIsViewingTrashNode(false);
        args.trash.closeTrashView();
        args.externalView.closeExternalView();
        args.virtualView.closeVirtualView();
        args.ws.setBrowseRootNode(INBOX_NODE_ID);
        return true;
      }
    });
  };
  return {
    createFolder: createDirectNode('folder'),
    createItem: createDirectNode('item'),
    createTopic,
    createVirtualFolder: createVirtualFolderCommand({
      createVirtualNode: args.ws.createVirtualNode,
      onOpenVirtualView: args.layoutProps.virtualView.onOpenVirtualView,
      onSelectNodeInVirtualView: args.layoutProps.navigation.onSelectNodeInVirtualView
    })
  };
}
