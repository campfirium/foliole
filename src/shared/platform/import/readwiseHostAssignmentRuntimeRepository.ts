import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { NativeReadwiseHostAssignment, NativeReadwiseJoinDecision } from '../../../../lib/platform/nativeReadwiseHostContract';
import { getRuntimeInvoke } from '../runtimeInvoke';

export async function loadReadwiseHostAssignmentFromRuntime(): Promise<NativeReadwiseHostAssignment | null> {
  const invoke = getRuntimeInvoke();
  return invoke ? invoke(NATIVE_COMMANDS.loadReadwiseHostAssignment) : null;
}

export async function activateReadwiseOnThisHostInRuntime(): Promise<NativeReadwiseHostAssignment | null> {
  const invoke = getRuntimeInvoke();
  return invoke ? invoke(NATIVE_COMMANDS.activateReadwiseOnThisHost) : null;
}

export async function resolveReadwiseJoinDecisionInRuntime(): Promise<NativeReadwiseJoinDecision | null> {
  const invoke = getRuntimeInvoke();
  return invoke ? invoke(NATIVE_COMMANDS.resolveReadwiseJoinDecision) : null;
}

export async function selectReadwiseImportDeviceInRuntime(deviceId: string): Promise<NativeReadwiseHostAssignment | null> {
  const invoke = getRuntimeInvoke();
  return invoke ? invoke(NATIVE_COMMANDS.selectReadwiseImportDevice, { device_id: deviceId }) : null;
}
