import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { NativeReadwiseHostAssignment } from '../../../../lib/platform/nativeReadwiseHostContract';
import { getRuntimeInvoke } from '../runtimeInvoke';

export async function loadReadwiseHostAssignmentFromRuntime(): Promise<NativeReadwiseHostAssignment | null> {
  const invoke = getRuntimeInvoke();
  return invoke ? invoke(NATIVE_COMMANDS.loadReadwiseHostAssignment) : null;
}

export async function activateReadwiseOnThisHostInRuntime(): Promise<NativeReadwiseHostAssignment | null> {
  const invoke = getRuntimeInvoke();
  return invoke ? invoke(NATIVE_COMMANDS.activateReadwiseOnThisHost) : null;
}
