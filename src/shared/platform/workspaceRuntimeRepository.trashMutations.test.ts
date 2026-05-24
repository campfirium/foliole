import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

const mocks = vi.hoisted(() => ({
  logRuntimeError: vi.fn(),
  runtimeInvoke: vi.fn()
}));

vi.mock('./runtimeInvoke', () => ({
  getRuntimeInvoke: () => mocks.runtimeInvoke
}));

vi.mock('./runtimeLogging', () => ({
  logRuntimeError: mocks.logRuntimeError
}));

vi.mock('./removedSourcesRuntimeRepository', () => ({
  refreshRuntimeRemovedSources: vi.fn()
}));

vi.mock('./runtime', () => ({
  isDesktopRuntime: () => true
}));

import {
  deleteWorkspaceNodesPermanently,
  softDeleteWorkspaceNodes
} from './workspaceRuntimeRepository';

beforeEach(() => {
  mocks.logRuntimeError.mockReset();
  mocks.runtimeInvoke.mockReset();
});

it('returns soft delete runtime success results', async () => {
  mocks.runtimeInvoke.mockResolvedValue({ deletedNodeIds: ['node-1'] });

  await expect(softDeleteWorkspaceNodes({
    deletedAt: '2026-05-24T00:00:00.000Z',
    nodeIds: ['node-1']
  })).resolves.toEqual({ deletedNodeIds: ['node-1'] });

  expect(mocks.runtimeInvoke).toHaveBeenCalledWith(NATIVE_COMMANDS.softDeleteNodes, {
    deletedAt: '2026-05-24T00:00:00.000Z',
    nodeIds: ['node-1']
  });
});

it('returns undefined when soft delete runtime fails', async () => {
  const error = new Error('sqlite failed');
  mocks.runtimeInvoke.mockRejectedValue(error);

  await expect(softDeleteWorkspaceNodes({
    deletedAt: '2026-05-24T00:00:00.000Z',
    nodeIds: ['node-1']
  })).resolves.toBeUndefined();

  expect(mocks.logRuntimeError).toHaveBeenCalledWith('runtime sync failed', {
    action: 'sync_soft_delete_nodes',
    area: 'native',
    command: NATIVE_COMMANDS.softDeleteNodes,
    error,
    fallback: 'none'
  });
});

it('returns undefined when permanent delete runtime result is invalid', async () => {
  mocks.runtimeInvoke.mockResolvedValue(null);

  await expect(deleteWorkspaceNodesPermanently({
    nodeIds: ['node-1'],
    nodeOrder: []
  })).resolves.toBeUndefined();
});
