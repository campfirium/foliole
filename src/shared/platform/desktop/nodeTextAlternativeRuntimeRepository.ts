import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import { toRuntimeNodeSourceUpdatePreview } from '../nodeSourceUpdateRuntimePayloads';
import { getRuntimeInvoke } from '../runtimeInvoke';

export async function loadRuntimeNodeTextAlternativePreview(nodeId: string) {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return toRuntimeNodeSourceUpdatePreview(await invoke(NATIVE_COMMANDS.loadNodeTextAlternativePreview, { node_id: nodeId }));
}

export async function dismissRuntimeNodeTextAlternative(alternativeId: string) {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return invoke(NATIVE_COMMANDS.dismissNodeTextAlternative, { alternative_id: alternativeId });
}

export async function promoteRuntimeNodeTextAlternative(alternativeId: string) {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return invoke(NATIVE_COMMANDS.promoteNodeTextAlternative, { alternative_id: alternativeId });
}
