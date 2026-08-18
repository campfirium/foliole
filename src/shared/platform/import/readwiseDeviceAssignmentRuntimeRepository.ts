import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { NativeReadwiseDeviceAssignment } from '../../../../lib/platform/nativeReadwiseDeviceContract';
import { getRuntimeInvoke } from '../runtimeInvoke';

export async function loadReadwiseDeviceAssignmentFromRuntime(): Promise<NativeReadwiseDeviceAssignment | null> {
  const invoke = getRuntimeInvoke();
  return invoke ? invoke(NATIVE_COMMANDS.loadReadwiseDeviceAssignment) : null;
}

export async function activateReadwiseOnThisDeviceInRuntime(): Promise<NativeReadwiseDeviceAssignment | null> {
  const invoke = getRuntimeInvoke();
  return invoke ? invoke(NATIVE_COMMANDS.activateReadwiseOnThisDevice) : null;
}
