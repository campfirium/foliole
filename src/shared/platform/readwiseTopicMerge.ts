import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeMergeReadwiseTopicHighlightsResult } from '../../../lib/platform/nativeContract';

import { getRuntimeInvoke } from './runtimeInvoke';

function isMergeResult(value: unknown): value is NativeMergeReadwiseTopicHighlightsResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.node_id === 'string' &&
    typeof payload.merged_highlight_count === 'number' &&
    (payload.status === 'error' || payload.status === 'merged' || payload.status === 'noop')
  );
}

export async function mergeRuntimeReadwiseTopicHighlights(
  nodeId: string
): Promise<NativeMergeReadwiseTopicHighlightsResult | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  const result = await runtimeInvoke(NATIVE_COMMANDS.mergeReadwiseTopicHighlights, { node_id: nodeId });
  return isMergeResult(result) ? result : null;
}
