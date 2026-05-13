import { NATIVE_COMMANDS } from './nativeCommands.js';
import type {
  NativeCommandArgs,
  NativeInvoke
} from './nativeContract.js';

export function invokeLoadSyncIndex(invoke: NativeInvoke) {
  return invoke(NATIVE_COMMANDS.loadSyncIndex);
}

export function invokeLoadSyncObjects(
  invoke: NativeInvoke,
  args: NativeCommandArgs<typeof NATIVE_COMMANDS.loadSyncObjects>
) {
  return invoke(NATIVE_COMMANDS.loadSyncObjects, args);
}

export function invokeApplySyncObjects(
  invoke: NativeInvoke,
  args: NativeCommandArgs<typeof NATIVE_COMMANDS.applySyncObjects>
) {
  return invoke(NATIVE_COMMANDS.applySyncObjects, args);
}

export function invokeLoadSyncNodes(
  invoke: NativeInvoke,
  args: NativeCommandArgs<typeof NATIVE_COMMANDS.loadSyncNodes>
) {
  return invoke(NATIVE_COMMANDS.loadSyncNodes, args);
}

export function invokeLoadSyncNodeConflicts(
  invoke: NativeInvoke,
  args?: NativeCommandArgs<typeof NATIVE_COMMANDS.loadSyncNodeConflicts>
) {
  return args ? invoke(NATIVE_COMMANDS.loadSyncNodeConflicts, args) : invoke(NATIVE_COMMANDS.loadSyncNodeConflicts);
}

export function invokeApplySyncNodes(
  invoke: NativeInvoke,
  args: NativeCommandArgs<typeof NATIVE_COMMANDS.applySyncNodes>
) {
  return invoke(NATIVE_COMMANDS.applySyncNodes, args);
}

export function invokeRecordSyncNodeConflicts(
  invoke: NativeInvoke,
  args: NativeCommandArgs<typeof NATIVE_COMMANDS.recordSyncNodeConflicts>
) {
  return invoke(NATIVE_COMMANDS.recordSyncNodeConflicts, args);
}
