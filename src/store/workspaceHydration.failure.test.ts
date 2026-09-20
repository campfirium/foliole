import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ invoke: vi.fn(), history: vi.fn() }));
vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => runtime.invoke }));
vi.mock('../shared/platform/runtime/editorOperationHistoryRuntimeRepository', () => ({
  loadEditorOperationHistoryFromRuntime: runtime.history,
  scheduleEditorOperationHistorySave: vi.fn()
}));

import { useWorkspaceStore } from './workspaceStore';
import { ensureWorkspaceHydrated } from './workspaceStoreHydration';

beforeEach(() => {
  runtime.invoke.mockReset();
  runtime.history.mockReset().mockResolvedValue(null);
  runtime.invoke.mockResolvedValue(null);
  useWorkspaceStore.setState({ isHydrated: false, workspaceHydrationError: null });
});

it('rejects failed reads through real Zustand hydration and allows a clean retry', async () => {
  runtime.invoke.mockImplementation(async (command: string) => {
    if (command === 'load_workspace_list_snapshot') throw new Error('workspace read failed');
    return null;
  });
  await expect(ensureWorkspaceHydrated()).rejects.toThrow('workspace read failed');
  expect(useWorkspaceStore.getState()).toMatchObject({ isHydrated: false, workspaceHydrationError: 'workspace read failed' });
  expect(useWorkspaceStore.persist.hasHydrated()).toBe(false);
  expect(runtime.history).not.toHaveBeenCalled();

  runtime.invoke.mockImplementation(async (command: string) => command === 'load_workspace_list_snapshot'
    ? { activeNodeId: null, nodesById: {}, nodeOrder: [], trashedNodeIds: [] } : null);
  await expect(ensureWorkspaceHydrated()).resolves.toBeUndefined();
  expect(useWorkspaceStore.getState()).toMatchObject({ isHydrated: true, workspaceHydrationError: null });
  expect(runtime.history).toHaveBeenCalledOnce();
});

it('preserves the existing no-snapshot result when the runtime succeeds', async () => {
  await expect(ensureWorkspaceHydrated()).resolves.toBeUndefined();
  expect(useWorkspaceStore.getState()).toMatchObject({ isHydrated: true, workspaceHydrationError: null });
});
