import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type {
  NativeReadwiseSourceCutoverPreview,
  NativeReadwiseSourceCutoverResult
} from '../../../../lib/platform/nativeReadwiseSourceCutoverContract';
import { getRuntimeInvoke } from '../runtimeInvoke';

export async function previewReadwiseSourceCutoverInRuntime(): Promise<NativeReadwiseSourceCutoverPreview> {
  const invoke = getRuntimeInvoke();
  return invoke
    ? invoke(NATIVE_COMMANDS.previewReadwiseSourceCutover)
    : { completed_count: 0, error_reason: null, phase: null, status: 'not_active_host', topic_count: 0, total_count: null };
}

export async function runReadwiseSourceCutoverInRuntime(): Promise<NativeReadwiseSourceCutoverResult> {
  const invoke = getRuntimeInvoke();
  return invoke
    ? invoke(NATIVE_COMMANDS.runReadwiseSourceCutover)
    : { error_reason: 'request_failed', migrated_count: 0, status: 'failed', unmatched_count: 0 };
}
