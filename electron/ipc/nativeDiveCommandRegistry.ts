import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

export const NATIVE_DIVE_COMMAND_REGISTRY = [
  { command: NATIVE_COMMANDS.listDives, route: 'storage', capability: 'read' },
  { command: NATIVE_COMMANDS.createDive, route: 'storage', capability: 'dataMutation' },
  { command: NATIVE_COMMANDS.renameDive, route: 'storage', capability: 'dataMutation' },
  { command: NATIVE_COMMANDS.convertDiveDirectory, route: 'storage', capability: 'dataMutation' },
  { command: NATIVE_COMMANDS.addDiveSources, route: 'storage', capability: 'dataMutation' },
  { command: NATIVE_COMMANDS.removeDiveSource, route: 'storage', capability: 'dataMutation' },
] as const;
