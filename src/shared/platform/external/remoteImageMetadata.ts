import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import { getRuntimeInvoke } from '../runtimeInvoke';

function isIntrinsicSize(value: unknown): value is { height: number; width: number } {
  if (!value || typeof value !== 'object') return false;
  const size = value as Record<string, unknown>;
  return Number.isInteger(size.height) && Number(size.height) > 0
    && Number.isInteger(size.width) && Number(size.width) > 0;
}

export async function loadRemoteImageMetadata(
  sourceUrl: string,
  nodeId: string | null,
  bypassFailureCache = false
) {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  const result = await invoke(NATIVE_COMMANDS.loadRemoteImageMetadata, {
    bypass_failure_cache: bypassFailureCache,
    node_id: nodeId,
    source_url: sourceUrl
  });
  return isIntrinsicSize(result.intrinsic_size) ? result.intrinsic_size : null;
}
