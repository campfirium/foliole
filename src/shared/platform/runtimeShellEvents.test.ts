import { beforeEach, expect, it, vi } from 'vitest';

import type {
  ElectronAPI,
  ReadwiseReaderImportProgressPayload,
  WorkspaceContentChangedPayload,
  WorkspaceSyncAppliedPayload
} from './electronApi';
import {
  onReadwiseReaderImportProgress,
  onWorkspaceContentChanged,
  onWorkspaceSyncApplied
} from './runtimeShellEvents';

function createMockElectronApi(
  overrides: Partial<ElectronAPI>
): ElectronAPI {
  return {
    invoke: vi.fn(),
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined,
    ...overrides
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  delete window.electronAPI;
});

function emitReadwiseProgressPayloads(handler: (payload: ReadwiseReaderImportProgressPayload) => void) {
  handler({ processedCount: 0, status: 'running', totalCount: 2 });
  handler({
    highlightProcessedCount: 10,
    highlightTotalCount: 20,
    phase: 'writing',
    processedCount: 1,
    sourceProcessedCount: 2,
    sourceTotalCount: 4,
    status: 'running',
    totalCount: 2
  });
  handler({
    indexFailedCount: 0,
    indexElapsedMs: 1400,
    indexPendingCount: 4,
    indexProcessedCount: 6,
    indexTotalCount: 10,
    phase: 'indexing',
    processedCount: 1,
    status: 'running',
    totalCount: 2
  });
  handler({ indexProcessedCount: 11, indexTotalCount: 10, phase: 'indexing', processedCount: 1, status: 'running', totalCount: 2 });
  handler({ highlightProcessedCount: 21, highlightTotalCount: 20, processedCount: 1, status: 'running', totalCount: 2 });
  handler({ processedCount: 3, status: 'running', totalCount: 2 });
  handler({ processedCount: 2, status: 'paused' as never, totalCount: 2 });
  handler({ processedCount: 2, status: 'completed', totalCount: 2 });
}

it('filters empty workspace sync applied events before reaching the handler', async () => {
  const onWorkspaceSyncAppliedBridge = vi.fn((handler: (payload: WorkspaceSyncAppliedPayload) => void) => {
    handler({ appliedNodeIds: [], appliedObjectIds: [], appliedReviewOpIds: [] });
    handler({ appliedNodeIds: ['node-1'], appliedObjectIds: [], appliedReviewOpIds: [] });
    return () => undefined;
  });
  window.electronAPI = createMockElectronApi({
    onWorkspaceSyncApplied: onWorkspaceSyncAppliedBridge
  });
  const handler = vi.fn();

  await onWorkspaceSyncApplied(handler);

  expect(handler).toHaveBeenCalledTimes(1);
  expect(handler).toHaveBeenCalledWith({ appliedNodeIds: ['node-1'], appliedObjectIds: [], appliedReviewOpIds: [] });
});

it('filters malformed workspace content changed events before reaching the handler', async () => {
  const onWorkspaceContentChangedBridge = vi.fn((handler: (payload: WorkspaceContentChangedPayload) => void) => {
    handler({ scope: '' as WorkspaceContentChangedPayload['scope'] });
    handler({ scope: 'workspace' });
    return () => undefined;
  });
  window.electronAPI = createMockElectronApi({
    onWorkspaceContentChanged: onWorkspaceContentChangedBridge
  });
  const handler = vi.fn();

  await onWorkspaceContentChanged(handler);

  expect(handler).toHaveBeenCalledTimes(1);
  expect(handler).toHaveBeenCalledWith({ scope: 'workspace' });
});

it('filters malformed Readwise Reader import progress events before reaching the handler', async () => {
  const onReadwiseReaderImportProgressBridge = vi.fn(
    (handler: (payload: ReadwiseReaderImportProgressPayload) => void) => {
      emitReadwiseProgressPayloads(handler);
      return () => undefined;
    }
  );
  window.electronAPI = createMockElectronApi({
    onReadwiseReaderImportProgress: onReadwiseReaderImportProgressBridge
  });
  const handler = vi.fn();

  await onReadwiseReaderImportProgress(handler);

  expect(handler).toHaveBeenCalledTimes(4);
  expect(handler).toHaveBeenNthCalledWith(1, {
    processedCount: 0,
    status: 'running',
    totalCount: 2
  });
  expect(handler).toHaveBeenNthCalledWith(2, {
    highlightProcessedCount: 10,
    highlightTotalCount: 20,
    phase: 'writing',
    processedCount: 1,
    sourceProcessedCount: 2,
    sourceTotalCount: 4,
    status: 'running',
    totalCount: 2
  });
  expect(handler).toHaveBeenNthCalledWith(3, {
    indexFailedCount: 0,
    indexElapsedMs: 1400,
    indexPendingCount: 4,
    indexProcessedCount: 6,
    indexTotalCount: 10,
    phase: 'indexing',
    processedCount: 1,
    status: 'running',
    totalCount: 2
  });
  expect(handler).toHaveBeenNthCalledWith(4, {
    processedCount: 2,
    status: 'completed',
    totalCount: 2
  });
});
