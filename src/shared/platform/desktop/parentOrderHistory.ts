import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { NativeParentOrderHistory } from '../../../../lib/platform/nativeParentOrderContract';
import { getRuntimeInvoke, isRuntimeInvokeAvailable } from '../runtimeInvoke';

export type SavedParentOrderHistory = NativeParentOrderHistory;

export function canReadSavedArrangements() {
  return isRuntimeInvokeAvailable();
}

export async function loadSavedArrangements(input: {
  parentId: string;
  afterVersionId?: string;
}) {
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('parent_order_history_runtime_unavailable');
  return invoke<typeof NATIVE_COMMANDS.readParentOrderHistory>(NATIVE_COMMANDS.readParentOrderHistory, input);
}

export async function restoreSavedArrangement(input: {
  parentId: string;
  versionId: string;
}) {
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('parent_order_history_runtime_unavailable');
  return invoke<typeof NATIVE_COMMANDS.restoreParentOrderSnapshot>(NATIVE_COMMANDS.restoreParentOrderSnapshot, input);
}
