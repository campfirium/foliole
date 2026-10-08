import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { NativePartitionBodyMutationArgs } from '../../../../lib/platform/nativeNodeMutationContract';
import { getRuntimeInvoke } from '../runtimeInvoke';
import { isNodeMutationPatchResult } from '../workspaceRuntimeMutationResults';

export async function savePartitionedWorkspaceBody(args: Omit<NativePartitionBodyMutationArgs, 'disposition'>) {
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('body_partition_runtime_unavailable');
  const result = await invoke(NATIVE_COMMANDS.splitTopic, { ...args, disposition: 'partition-body' });
  if (!isNodeMutationPatchResult(result)) throw new Error('body_partition_result_invalid');
  return result;
}
