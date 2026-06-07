import { beforeEach, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import { workspacePersistStorage } from './workspacePersistStorage';

vi.mock('../shared/platform/readingPositionTraceRuntimeRepository', () => ({
  appendReadingPositionTraceLog: vi.fn()
}));

vi.mock('../shared/platform/runtimeBootTelemetry', () => ({
  reportRuntimeBootStage: vi.fn()
}));

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(getRuntimeInvoke).mockReset();
  window.localStorage.clear();
});

it('coalesces concurrent runtime workspace hydrate reads by storage key', async () => {
  let resolveSnapshot: (value: unknown) => void = () => undefined;
  const snapshotPromise = new Promise((resolve) => {
    resolveSnapshot = resolve;
  });
  const invoke = vi.fn().mockImplementation((command: string) => {
    if (command === 'load_workspace_list_snapshot') {
      return snapshotPromise;
    }
    if (command === 'load_reading_progress') {
      return Promise.resolve(null);
    }
    return Promise.resolve(null);
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  const firstRead = workspacePersistStorage.getItem('foliole-workspace-v1');
  const secondRead = workspacePersistStorage.getItem('foliole-workspace-v1');

  await Promise.resolve();
  expect(invoke.mock.calls.filter(([command]) => command === 'load_workspace_list_snapshot')).toHaveLength(1);

  resolveSnapshot({
    activeNodeId: null,
    nodeOrder: [],
    nodesById: {},
    trashedNodeIds: []
  });
  const [firstValue, secondValue] = await Promise.all([firstRead, secondRead]);

  expect(firstValue).toBe(secondValue);
  expect(invoke.mock.calls.filter(([command]) => command === 'load_reading_progress')).toHaveLength(1);
});
