import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

export const NATIVE_FOLDER_LIST_SORT_COMMAND_REGISTRY = [
  { command: NATIVE_COMMANDS.loadFolderListSortMemory, route: 'storage', capability: 'read' },
  { command: NATIVE_COMMANDS.saveFolderListSortMemory, route: 'storage', capability: 'settingsMutation' },
] as const;
