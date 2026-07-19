import {
  canCreateChildNodeKind,
  findFolderTopicItemCommandByAppCommandId,
  resolveAllowedFolderTopicItemCommands
} from '../../../../lib/core/nodes/folderTopicItemCommands';
import { isVirtualNode } from '../model/specialNodes';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

import type { NodeListContextMenuController } from './NodeListTreeHooks';

export type NodeListCreateMenuSurface = 'folders' | 'topics' | 'virtual-topics';

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
  if (surface === 'virtual-topics') {
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
    const command = findFolderTopicItemCommandByAppCommandId(commandId);
    if (!command || !canCreateCommandInSurface(command, menuState.createMenuSurface) || menuState.showVirtualCreateOnly) {
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
