import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type {
  NativeReadwiseIdentityBindingPreview,
  NativeReadwiseIdentityBindingResult
} from '../../../../lib/platform/nativeReadwiseIdentityContract';
import { getRuntimeInvoke } from '../runtimeInvoke';

export async function previewReadwiseIdentityBindingsInRuntime(): Promise<NativeReadwiseIdentityBindingPreview> {
  const invoke = getRuntimeInvoke();
  return invoke ? invoke(NATIVE_COMMANDS.previewReadwiseIdentityBindings) : {
    annotation_count: 0,
    candidate_count: 0,
    conflict_count: 0,
    preview_id: null,
    status: 'unavailable',
    unmatched_count: 0
  };
}

export async function confirmReadwiseIdentityBindingsInRuntime(
  previewId: string
): Promise<NativeReadwiseIdentityBindingResult> {
  const invoke = getRuntimeInvoke();
  return invoke ? invoke(NATIVE_COMMANDS.confirmReadwiseIdentityBindings, { preview_id: previewId }) : {
    annotation_count: 0,
    bound_count: 0,
    status: 'unavailable'
  };
}
