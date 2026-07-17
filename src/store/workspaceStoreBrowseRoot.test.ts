import { beforeEach, expect, it, vi } from 'vitest';

import { HOME_NODE_ID } from '../features/nodes/model/specialNodes';
import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn(() => null)
}));

beforeEach(() => {
  localStorage.clear();
  delete window.electronAPI;
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-07-17T00:00:00.000Z')));
});

it('returns the browse root to Home when the selected folder is deleted', async () => {
  const folderId = await useWorkspaceStore.getState().createRootNode('', 'folder');
  expect(folderId).toBeTruthy();
  useWorkspaceStore.getState().setBrowseRootNode(folderId!);
  expect(useWorkspaceStore.getState().browseRootNodeId).toBe(folderId);

  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn(async (_command, payload?: { nodeIds?: string[] }) => ({
    deletedNodeIds: payload?.nodeIds ?? []
  })));
  await useWorkspaceStore.getState().deleteNode(folderId!);

  expect(useWorkspaceStore.getState().browseRootNodeId).toBe(HOME_NODE_ID);
});
