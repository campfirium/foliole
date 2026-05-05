import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getRuntimeInvoke } from './runtimeInvoke';

export function appendReadingPositionTraceLog(entry: { event: string; payload: unknown; timestamp: number }) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  void runtimeInvoke(NATIVE_COMMANDS.appendReadingPositionTraceLog, entry).catch((error) => {
    console.error('[reading-position] append trace log failed', { entry, error });
  });
}
