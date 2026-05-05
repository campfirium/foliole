import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { applySyncNodes } from '../database/syncApply.js';
import { recordSyncNodeConflicts } from '../database/syncConflicts.js';

export function handleSyncMutationCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.applySyncNodes) {
    return applySyncNodes(Array.isArray(args.nodes) ? (args.nodes as Parameters<typeof applySyncNodes>[0]) : []);
  }
  if (command === NATIVE_COMMANDS.recordSyncNodeConflicts) {
    return recordSyncNodeConflicts(
      Array.isArray(args.conflicts) ? (args.conflicts as Parameters<typeof recordSyncNodeConflicts>[0]) : []
    );
  }
  return undefined;
}
