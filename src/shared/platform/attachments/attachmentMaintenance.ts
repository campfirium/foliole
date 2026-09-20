import type { AttachmentMaintenanceRequest } from '../../../../lib/platform/attachmentMaintenanceContract';
import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import { runCompanionAttachmentMaintenance } from '../companion/runtime/companionAttachmentMaintenance';
import { requireAvailableCompanionRuntime } from '../companionRuntimeCapabilities';
import { getRuntimeInvoke } from '../runtimeInvoke';

export async function runAttachmentMaintenance(request: AttachmentMaintenanceRequest, signal?: AbortSignal) {
  const invoke = getRuntimeInvoke();
  if (invoke) return invoke(NATIVE_COMMANDS.maintainAttachments, request);
  const runtime = requireAvailableCompanionRuntime('attachment-maintenance');
  if (runtime.kind === 'android-native' || runtime.kind === 'ios-native') return runCompanionAttachmentMaintenance(request, signal);
  return null;
}
