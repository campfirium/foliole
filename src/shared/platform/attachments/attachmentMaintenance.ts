import type { AttachmentMaintenanceResult, AttachmentMaintenanceStatus, AttachmentObservationRequest,
  AttachmentObservationResult, AttachmentStatusRequest, AttachmentMaintenanceRequest } from '../../../../lib/platform/attachmentMaintenanceContract';
import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import { runCompanionAttachmentMaintenance } from '../companion/runtime/companionAttachmentMaintenance';
import { requireAvailableCompanionRuntime } from '../companionRuntimeCapabilities';
import { getRuntimeInvoke } from '../runtimeInvoke';

export function runAttachmentMaintenance(request: AttachmentObservationRequest, signal?: AbortSignal): Promise<AttachmentObservationResult | null>;
// eslint-disable-next-line no-redeclare -- Action-specific TypeScript overloads share one implementation.
export function runAttachmentMaintenance(request: AttachmentStatusRequest, signal?: AbortSignal): Promise<AttachmentMaintenanceStatus | null>;
// eslint-disable-next-line no-redeclare -- Action-specific TypeScript overloads share one implementation.
export function runAttachmentMaintenance(request: AttachmentMaintenanceRequest, signal?: AbortSignal): Promise<AttachmentMaintenanceResult | null>;
// eslint-disable-next-line no-redeclare -- Action-specific TypeScript overloads share one implementation.
export async function runAttachmentMaintenance(request: AttachmentMaintenanceRequest, signal?: AbortSignal) {
  const invoke = getRuntimeInvoke();
  if (invoke) return invoke(NATIVE_COMMANDS.maintainAttachments, request);
  const runtime = requireAvailableCompanionRuntime('attachment-maintenance');
  if (runtime.kind === 'android-native' || runtime.kind === 'ios-native') return runCompanionAttachmentMaintenance(request, signal);
  return null;
}
