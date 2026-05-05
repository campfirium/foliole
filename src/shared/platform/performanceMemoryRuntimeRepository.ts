import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativePerformanceMemorySnapshot } from '../../../lib/platform/nativeUtilityContract';

import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeWarning } from './runtimeLogging';

function isPerformanceMemorySnapshot(value: unknown): value is NativePerformanceMemorySnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return typeof (value as Record<string, unknown>).main_process_rss_bytes === 'number';
}

export async function loadRuntimePerformanceMemorySnapshot(): Promise<NativePerformanceMemorySnapshot | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  try {
    const result = await runtimeInvoke(NATIVE_COMMANDS.loadPerformanceMemorySnapshot);
    if (!isPerformanceMemorySnapshot(result)) {
      logRuntimeWarning('native performance memory payload invalid', {
        area: 'bridge',
        action: 'load_performance_memory_snapshot',
        command: NATIVE_COMMANDS.loadPerformanceMemorySnapshot,
        fallback: 'return_null'
      });
      return null;
    }
    return result;
  } catch (error) {
    logRuntimeWarning('native performance memory read failed', {
      area: 'bridge',
      action: 'load_performance_memory_snapshot',
      command: NATIVE_COMMANDS.loadPerformanceMemorySnapshot,
      fallback: 'return_null',
      error
    });
    return null;
  }
}
