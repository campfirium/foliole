import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type {
  NativeSourceManagementAction,
  NativeSourceManagementPreview,
  NativeSourceManagementResult,
  NativeSourceManagementType
} from '../../../../lib/platform/nativeSourceManagementContract';
import { getRuntimeInvoke } from '../runtimeInvoke';

function requireInvoke() {
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('source_management_runtime_unavailable');
  return invoke;
}

function payload(input: {
  action: NativeSourceManagementAction;
  hostName?: string;
  sourceRef?: string;
  sourceType?: NativeSourceManagementType;
}) {
  return {
    action: input.action,
    ...(input.hostName ? { host_name: input.hostName } : {}),
    ...(input.sourceRef ? { source_ref: input.sourceRef } : {}),
    ...(input.sourceType ? { source_type: input.sourceType } : {})
  };
}

export function previewSourceManagement(input: Parameters<typeof payload>[0]): Promise<NativeSourceManagementPreview> {
  return requireInvoke()(NATIVE_COMMANDS.previewSourceManagement, payload(input)) as Promise<NativeSourceManagementPreview>;
}

export function confirmSourceManagement(input: Parameters<typeof payload>[0]): Promise<NativeSourceManagementResult> {
  return requireInvoke()(NATIVE_COMMANDS.confirmSourceManagement, payload(input)) as Promise<NativeSourceManagementResult>;
}
