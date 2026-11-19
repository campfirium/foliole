import { afterEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { appendReadingPositionTraceLog } from './readingPositionTraceRuntimeRepository';

const { invoke, hasRuntimeDebugBridge } = vi.hoisted(() => ({
  invoke: vi.fn().mockResolvedValue(null),
  hasRuntimeDebugBridge: vi.fn()
}));

vi.mock('./runtimeInvoke', () => ({ getRuntimeInvoke: () => invoke }));
vi.mock('./runtimeDebugAvailability', () => ({ hasRuntimeDebugBridge }));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

it.each([false, true])('only sends reading trace IPC when debug is enabled (%s)', (debugEnabled) => {
  vi.stubEnv('DEV', false);
  hasRuntimeDebugBridge.mockReturnValue(debugEnabled);
  const record = { event: 'reading-progress.hydrate-load', payload: null, timestamp: 1 };

  appendReadingPositionTraceLog(record);

  if (debugEnabled) expect(invoke).toHaveBeenCalledWith(NATIVE_COMMANDS.appendReadingPositionTraceLog, record);
  else expect(invoke).not.toHaveBeenCalled();
});
