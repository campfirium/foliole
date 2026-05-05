import { NATIVE_COMMANDS } from '../../platform/nativeCommands.js';

import type { NodeKind } from './nodeKind.js';

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
  nativeCommand:
    | typeof NATIVE_COMMANDS.createFolder
    | typeof NATIVE_COMMANDS.createTopic
    | typeof NATIVE_COMMANDS.createItem;
  paletteTitle: string;
}

export const FOLDER_TOPIC_ITEM_COMMANDS: readonly FolderTopicItemCommandDefinition[] = [
  {
    appCommandId: FOLDER_TOPIC_ITEM_APP_COMMAND_IDS.createFolder,
    kind: 'folder',
    listLabel: 'Create Folder',
    menuLabel: 'Create Folder',
    nativeCommand: NATIVE_COMMANDS.createFolder,
    paletteTitle: 'Create Folder'
  },
  {
    appCommandId: FOLDER_TOPIC_ITEM_APP_COMMAND_IDS.createTopic,
    kind: 'topic',
    listLabel: 'Create Topic',
    menuLabel: 'Create Topic',
    nativeCommand: NATIVE_COMMANDS.createTopic,
    paletteTitle: 'Create Topic'
  },
  {
    appCommandId: FOLDER_TOPIC_ITEM_APP_COMMAND_IDS.createItem,
    kind: 'item',
    listLabel: 'Create Item',
    menuLabel: 'Create Item',
    nativeCommand: NATIVE_COMMANDS.createItem,
    paletteTitle: 'Create Item'
  }
] as const;

export function findFolderTopicItemCommandByAppCommandId(commandId: string) {
  return FOLDER_TOPIC_ITEM_COMMANDS.find((command) => command.appCommandId === commandId) ?? null;
}

export function findFolderTopicItemCommandByKind(kind: NodeKind) {
  return FOLDER_TOPIC_ITEM_COMMANDS.find((command) => command.kind === kind) ?? null;
}
