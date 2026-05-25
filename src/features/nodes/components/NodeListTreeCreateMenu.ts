import {
  canCreateChildNodeKind,
  findFolderTopicItemCommandByAppCommandId,
  resolveAllowedFolderTopicItemCommands
} from '../../../../lib/core/nodes/folderTopicItemCommands';
import { VIRTUAL_NODE_APP_COMMAND_ID } from '../../../../lib/core/nodes/virtualNodeCommands';
import { isVirtualNode } from '../model/specialNodes';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

import type { NodeListContextMenuController } from './NodeListTreeHooks';

export type NodeListCreateMenuSurface = 'folders' | 'topics';

interface NodeListCreateMenuProps {
  contextMenu: Pick<NodeListContextMenuController, 'closeContextMenu'>;
  createChildNode: (parentNodeId: string, content?: string, kind?: 'folder' | 'topic' | 'item') => Promise<string | null>;
  createGlobalNode: (content?: string, kind?: 'folder' | 'topic' | 'item') => Promise<string | null>;
  createVirtualNode: () => Promise<string | null>;
  nodesById: WorkspaceListNodesById;
}

interface NodeListCreateMenuState {
  createMenuSurface: NodeListCreateMenuSurface;
  isHomeTarget: boolean;
  isRootMenu: boolean;
  primaryTarget?: WorkspaceListNodesById[string];
  primaryTargetId: string | null;
  showVirtualCreateOnly: boolean;
}

function canCreateCommandInSurface(command: ReturnType<typeof findFolderTopicItemCommandByAppCommandId>, surface: NodeListCreateMenuSurface) {
  if (!command) {
    return false;
  }
  return surface === 'folders' ? command.kind === 'folder' : command.kind !== 'folder';
}

export function resolveCreateCommands(menuState: NodeListCreateMenuState) {
  if (menuState.showVirtualCreateOnly || isVirtualNode(menuState.primaryTarget)) {
    return [];
  }
  const commands = resolveAllowedFolderTopicItemCommands(
    menuState.isRootMenu || menuState.isHomeTarget ? null : menuState.primaryTarget?.kind ?? null
  );
  return commands.filter((command) => canCreateCommandInSurface(command, menuState.createMenuSurface));
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
    if (!canCreateCommandInSurface(command, menuState.createMenuSurface) || menuState.showVirtualCreateOnly) {
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
