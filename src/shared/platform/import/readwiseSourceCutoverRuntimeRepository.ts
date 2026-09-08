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
    : { status: 'source_unavailable', topic_count: 0 };
}

export async function runReadwiseSourceCutoverInRuntime(): Promise<NativeReadwiseSourceCutoverResult> {
  const invoke = getRuntimeInvoke();
  return invoke
    ? invoke(NATIVE_COMMANDS.runReadwiseSourceCutover)
    : { migrated_count: 0, status: 'failed', unmatched_count: 0 };
}
