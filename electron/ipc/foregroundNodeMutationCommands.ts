import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

const commands = new Set<string>([
  NATIVE_COMMANDS.createFolder,
  NATIVE_COMMANDS.createTopic,
  NATIVE_COMMANDS.createItem,
  NATIVE_COMMANDS.splitTopic,
  NATIVE_COMMANDS.updateNodeContent,
  NATIVE_COMMANDS.updateNodeReveal,
  NATIVE_COMMANDS.updateNodeContentWithAnchors,
  NATIVE_COMMANDS.flushDirtyNodeSyncVersions,
  NATIVE_COMMANDS.replaceNodeOrder,
  NATIVE_COMMANDS.restoreParentOrderSnapshot,
  NATIVE_COMMANDS.moveNodes,
  NATIVE_COMMANDS.softDeleteNodes,
  NATIVE_COMMANDS.restoreNodes,
  NATIVE_COMMANDS.deleteNodesPermanently
]);

export function isForegroundNodeMutationCommand(command: string) {
  return commands.has(command);
}
