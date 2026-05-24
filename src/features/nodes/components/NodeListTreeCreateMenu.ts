import {
  canCreateChildNodeKind,
  findFolderTopicItemCommandByAppCommandId,
  resolveAllowedFolderTopicItemCommands
} from '../../../../lib/core/nodes/folderTopicItemCommands';
import { VIRTUAL_NODE_APP_COMMAND_ID } from '../../../../lib/core/nodes/virtualNodeCommands';
import { isVirtualNode } from '../model/specialNodes';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

import type { NodeListContextMenuController } from './NodeListTreeHooks';

interface NodeListCreateMenuProps {
  contextMenu: Pick<NodeListContextMenuController, 'closeContextMenu'>;
  createChildNode: (parentNodeId: string, content?: string, kind?: 'folder' | 'topic' | 'item') => Promise<string | null>;
  createGlobalNode: (content?: string, kind?: 'folder' | 'topic' | 'item') => Promise<string | null>;
  createVirtualNode: () => Promise<string | null>;
  nodesById: WorkspaceListNodesById;
}

interface NodeListCreateMenuState {
  isHomeTarget: boolean;
  isRootMenu: boolean;
  primaryTarget?: WorkspaceListNodesById[string];
  primaryTargetId: string | null;
  showVirtualCreateOnly: boolean;
}

export function resolveCreateCommands(menuState: NodeListCreateMenuState) {
  if (menuState.showVirtualCreateOnly || isVirtualNode(menuState.primaryTarget)) {
    return [];
  }
  return resolveAllowedFolderTopicItemCommands(
    menuState.isRootMenu || menuState.isHomeTarget ? null : menuState.primaryTarget?.kind ?? null
  );
}

export function createCreateNodeHandler(
  props: NodeListCreateMenuProps,
  menuState: NodeListCreateMenuState
) {
  return (commandId: string) => {
    if (commandId === VIRTUAL_NODE_APP_COMMAND_ID) {
      props.createVirtualNode();
      props.contextMenu.closeContextMenu();
      return;
    }
    const command = findFolderTopicItemCommandByAppCommandId(commandId);
    if (!command || menuState.showVirtualCreateOnly) {
      props.contextMenu.closeContextMenu();
      return;
    }
    if (menuState.isRootMenu || menuState.isHomeTarget || !menuState.primaryTargetId) {
      props.createGlobalNode('', command.kind);
      props.contextMenu.closeContextMenu();
      return;
    }
    const parentNode = props.nodesById[menuState.primaryTargetId];
    if (!parentNode || !canCreateChildNodeKind(parentNode.kind ?? null, command.kind)) {
      props.contextMenu.closeContextMenu();
      return;
    }
    props.createChildNode(menuState.primaryTargetId, '', command.kind);
    props.contextMenu.closeContextMenu();
  };
}
