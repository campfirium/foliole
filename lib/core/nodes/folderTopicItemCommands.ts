import type { NodeKind } from './nodeKind.js';
import { NODE_KINDS } from './nodeKind.js';

export const FOLDER_TOPIC_ITEM_APP_COMMAND_IDS = {
  createFolder: 'workspace.createFolder',
  createTopic: 'workspace.createTopic',
  createItem: 'workspace.createItem'
} as const;

export interface FolderTopicItemCommandDefinition {
  appCommandId: (typeof FOLDER_TOPIC_ITEM_APP_COMMAND_IDS)[keyof typeof FOLDER_TOPIC_ITEM_APP_COMMAND_IDS];
  kind: NodeKind;
  listLabel: string;
  menuLabel: string;
  paletteTitle: string;
}

export const FOLDER_TOPIC_ITEM_COMMANDS: readonly FolderTopicItemCommandDefinition[] = [
  {
    appCommandId: FOLDER_TOPIC_ITEM_APP_COMMAND_IDS.createFolder,
    kind: 'folder',
    listLabel: 'Create Folder',
    menuLabel: 'Create Folder',
    paletteTitle: 'Create Folder'
  },
  {
    appCommandId: FOLDER_TOPIC_ITEM_APP_COMMAND_IDS.createTopic,
    kind: 'topic',
    listLabel: 'Create Topic',
    menuLabel: 'Create Topic',
    paletteTitle: 'Create Topic'
  },
  {
    appCommandId: FOLDER_TOPIC_ITEM_APP_COMMAND_IDS.createItem,
    kind: 'item',
    listLabel: 'Create Item',
    menuLabel: 'Create Item',
    paletteTitle: 'Create Item'
  }
] as const;

export function findFolderTopicItemCommandByAppCommandId(commandId: string) {
  return FOLDER_TOPIC_ITEM_COMMANDS.find((command) => command.appCommandId === commandId) ?? null;
}

export function findFolderTopicItemCommandByKind(kind: NodeKind) {
  return FOLDER_TOPIC_ITEM_COMMANDS.find((command) => command.kind === kind) ?? null;
}

export function resolveAllowedChildNodeKinds(parentKind: NodeKind | null): readonly NodeKind[] {
  if (parentKind === null || parentKind === 'folder') {
    return NODE_KINDS;
  }
  if (parentKind === 'topic') {
    return ['topic', 'item'] as const;
  }
  return [] as const;
}

export function canCreateChildNodeKind(parentKind: NodeKind | null, childKind: NodeKind) {
  return resolveAllowedChildNodeKinds(parentKind).includes(childKind);
}

export function resolveAllowedFolderTopicItemCommands(parentKind: NodeKind | null) {
  const allowedKinds = resolveAllowedChildNodeKinds(parentKind);
  return FOLDER_TOPIC_ITEM_COMMANDS.filter((command) => allowedKinds.includes(command.kind));
}
