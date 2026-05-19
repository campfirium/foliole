import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

const mocks = vi.hoisted(() => ({
  logRuntimeError: vi.fn(),
  refreshRuntimeRemovedSources: vi.fn(),
  runtimeInvoke: vi.fn()
}));

vi.mock('./removedSourcesRuntimeRepository', () => ({
  refreshRuntimeRemovedSources: mocks.refreshRuntimeRemovedSources
}));

vi.mock('./runtimeInvoke', () => ({
  getRuntimeInvoke: () => mocks.runtimeInvoke
}));

vi.mock('./runtimeLogging', () => ({
  logRuntimeError: mocks.logRuntimeError
}));

vi.mock('./runtime', () => ({
  isDesktopRuntime: () => true
}));

import { deleteWorkspaceNodesPermanently } from './workspaceRuntimeRepository';

beforeEach(() => {
  mocks.logRuntimeError.mockReset();
  mocks.refreshRuntimeRemovedSources.mockReset();
  mocks.runtimeInvoke.mockReset();
});

it('refreshes Removed sources after permanent delete sync completes', async () => {
  mocks.runtimeInvoke.mockResolvedValue(null);
  mocks.refreshRuntimeRemovedSources.mockResolvedValue({ entries: [], loadedAt: '2026-05-18T00:00:00.000Z' });

  deleteWorkspaceNodesPermanently({ nodeIds: ['node-1'], nodeOrder: [] });
  await vi.waitFor(() => expect(mocks.refreshRuntimeRemovedSources).toHaveBeenCalled());

  expect(mocks.runtimeInvoke).toHaveBeenCalledWith(NATIVE_COMMANDS.deleteNodesPermanently, {
    nodeIds: ['node-1'],
    nodeOrder: []
  });
});

it('keeps permanent delete synced when Removed refresh fails', async () => {
  const refreshError = new Error('refresh failed');
  mocks.runtimeInvoke.mockResolvedValue(null);
  mocks.refreshRuntimeRemovedSources.mockRejectedValue(refreshError);

  deleteWorkspaceNodesPermanently({ nodeIds: ['node-1'], nodeOrder: [] });

  await vi.waitFor(() => {
    expect(mocks.logRuntimeError).toHaveBeenCalledWith('runtime post-sync refresh failed', {
      action: 'sync_delete_nodes_permanently_post_refresh',
      area: 'native',
      command: NATIVE_COMMANDS.deleteNodesPermanently,
      error: refreshError,
      fallback: 'keep_cached'
    });
  });
  expect(mocks.runtimeInvoke).toHaveBeenCalledWith(NATIVE_COMMANDS.deleteNodesPermanently, {
    nodeIds: ['node-1'],
    nodeOrder: []
  });
});
