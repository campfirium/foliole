import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => runtime.invoke }));


import { refreshWorkspaceState } from './workspaceRefreshScheduler';
import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';
import { ensureWorkspaceHydrated } from './workspaceStoreHydration';

const originalMerge = useWorkspaceStore.persist.getOptions().merge!;
const merge = vi.fn(originalMerge);
let resolveSnapshot: (value: unknown) => void;

beforeEach(() => {
  window.localStorage.clear();
  runtime.invoke.mockReset();
  merge.mockClear();
  useWorkspaceStore.persist.setOptions({ merge });
  useWorkspaceStore.setState(createInitialWorkspaceState());
  const pending = new Promise((resolve) => { resolveSnapshot = resolve; });
  runtime.invoke.mockImplementation(async (command: string) =>
    command === 'load_workspace_list_snapshot' ? pending : null);
});

afterEach(() => {
  useWorkspaceStore.persist.setOptions({ merge: originalMerge });
});

function release() {
  resolveSnapshot({ activeNodeId: null, nodesById: {}, nodeOrder: [], trashedNodeIds: [] });
}

it('joins repeated startup callers into one hydration of the singleton store', async () => {
  const first = ensureWorkspaceHydrated();
  const second = ensureWorkspaceHydrated();
  expect(first).toBe(second);
  release();
  await Promise.all([first, second]);
  expect(runtime.invoke.mock.calls.filter(([command]) => command === 'load_workspace_list_snapshot')).toHaveLength(1);
  expect(merge).toHaveBeenCalledTimes(1);
  expect(runtime.invoke.mock.calls.some(([command]) => command === 'load_editor_operation_history')).toBe(false);
  expect(useWorkspaceStore.getState().isHydrated).toBe(true);
});

it('merges once into the same store when startup and the actual refresh scheduler overlap', async () => {
  const startup = ensureWorkspaceHydrated();
  const refresh = refreshWorkspaceState('formal-import');
  release();
  await Promise.all([startup, refresh]);
  expect(runtime.invoke.mock.calls.filter(([command]) => command === 'load_workspace_list_snapshot')).toHaveLength(1);
  expect(merge).toHaveBeenCalledTimes(1);
  expect(useWorkspaceStore.getState().isHydrated).toBe(true);
  expect(useWorkspaceStore.getState().workspaceHydrationError).toBeNull();
});
