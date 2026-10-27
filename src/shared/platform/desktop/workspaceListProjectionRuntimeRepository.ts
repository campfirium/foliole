import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { NativeCommandMap } from '../../../../lib/platform/nativeContract';
import { getRuntimeInvoke } from '../runtimeInvoke';

export async function loadWorkspaceListProjectionFromRuntime(
  input: NativeCommandMap[typeof NATIVE_COMMANDS.loadWorkspaceListProjection]['args']
) {
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('workspace_projection_bridge_unavailable');
  const projection = await invoke(NATIVE_COMMANDS.loadWorkspaceListProjection, input);
  return projection;
}
