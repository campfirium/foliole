import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeInvoke } from '../../../../lib/platform/nativeContract';

import {
  flushEditorOperationHistorySave,
  loadEditorOperationHistoryFromRuntime,
  scheduleEditorOperationHistorySave
} from './editorOperationHistoryRuntimeRepository';

function createMockElectronApi(invoke: NativeInvoke) {
  return {
    invoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };
}

beforeEach(() => {
  delete window.electronAPI;
});

it('loads durable editor history through the native bridge', async () => {
  const invoke = vi.fn().mockResolvedValue('{"version":1}');
  window.electronAPI = createMockElectronApi(invoke);

  await expect(loadEditorOperationHistoryFromRuntime()).resolves.toBe('{"version":1}');
  expect(invoke).toHaveBeenCalledWith('load_editor_operation_history');
});

it('serializes history writes and leaves the newest payload last', async () => {
  const writes: string[] = [];
  const invoke = vi.fn(async (command: string, args?: { payloadJson?: string }) => {
    if (command === 'save_editor_operation_history' && args?.payloadJson) writes.push(args.payloadJson);
    return null;
  });
  window.electronAPI = createMockElectronApi(invoke as NativeInvoke);

  const first = scheduleEditorOperationHistorySave('{"version":1,"step":1}');
  const second = scheduleEditorOperationHistorySave('{"version":1,"step":2}');
  await Promise.all([first, second]);

  expect(writes.at(-1)).toBe('{"version":1,"step":2}');
});

it('flushes a history update queued behind an in-flight write', async () => {
  let releaseFirstWrite: () => void = () => {};
  const firstWrite = new Promise<void>((resolve) => {
    releaseFirstWrite = resolve;
  });
  const writes: string[] = [];
  const invoke = vi.fn(async (command: string, args?: { payloadJson?: string }) => {
    if (command !== 'save_editor_operation_history' || !args?.payloadJson) return null;
    writes.push(args.payloadJson);
    if (writes.length === 1) await firstWrite;
    return null;
  });
  window.electronAPI = createMockElectronApi(invoke as NativeInvoke);

  void scheduleEditorOperationHistorySave('{"version":1,"step":1}');
  void scheduleEditorOperationHistorySave('{"version":1,"step":2}');
  const flush = flushEditorOperationHistorySave();
  await Promise.resolve();
  expect(writes).toEqual(['{"version":1,"step":1}']);

  releaseFirstWrite();
  await flush;

  expect(writes).toEqual([
    '{"version":1,"step":1}',
    '{"version":1,"step":2}'
  ]);
});
