import { appendReadingPositionTraceLog } from '../shared/platform/readingPositionTraceRuntimeRepository';
import { logRuntimeWarning } from '../shared/platform/runtimeLogging';
import { loadReadingProgressFromRuntime } from '../shared/platform/workspaceRuntimeRepository';

export async function loadReadingProgressForHydrate(name: string, requireResult = false) {
  const startedAt = Date.now();
  return loadReadingProgressFromRuntime().then((result) => {
    appendReadingPositionTraceLog({
      event: 'reading-progress.hydrate-load',
      payload: {
        activeNodeId: result?.activeNodeId ?? null,
        durationMs: Date.now() - startedAt,
        nodeViewStateCount:
          result && typeof result === 'object' && result.nodeViewStateById && typeof result.nodeViewStateById === 'object'
            ? Object.keys(result.nodeViewStateById).length
            : 0,
        storageKey: name
      },
      timestamp: Date.now()
    });
    return result;
  }).catch((error) => {
    if (requireResult) throw error;
    logRuntimeWarning('reading progress load failed during workspace hydrate', {
      area: 'persistence',
      action: 'hydrate_workspace_state',
      fallback: 'merge_snapshot_without_reading_progress',
      storageKey: name,
      error
    });
    return null;
  });
}
