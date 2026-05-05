import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { applySyncNodesAsync } from '../database/syncApply.js';
import { recordSyncNodeConflicts } from '../database/syncConflicts.js';
import { applySyncObjectsAsync } from '../database/syncObjectApply.js';

export function handleSyncMutationCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.applySyncNodes) {
    return applySyncNodesAsync(Array.isArray(args.nodes) ? (args.nodes as Parameters<typeof applySyncNodesAsync>[0]) : []);
  }
  if (command === NATIVE_COMMANDS.applySyncObjects) {
    return applySyncObjectsAsync(Array.isArray(args.objects) ? (args.objects as Parameters<typeof applySyncObjectsAsync>[0]) : []);
  }
  if (command === NATIVE_COMMANDS.recordSyncNodeConflicts) {
    return recordSyncNodeConflicts(
      Array.isArray(args.conflicts) ? (args.conflicts as Parameters<typeof recordSyncNodeConflicts>[0]) : []
    );
  }
  return undefined;
}
