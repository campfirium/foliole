// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

import { renameCollectionVirtualFolder } from '../agentControl/agentControlVirtualFolderLifecycle.js';
import { readAgentVirtualFolderRow } from '../agentControl/agentControlVirtualFolders.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';

import { handleNodeMutationCommand } from './storageNodeMutationCommands.js';

vi.mock('../agentControl/agentControlVirtualFolderLifecycle.js', () => ({ renameCollectionVirtualFolder: vi.fn() }));
vi.mock('../agentControl/agentControlVirtualFolders.js', () => ({ readAgentVirtualFolderRow: vi.fn() }));
vi.mock('../database/nodeMutations.js', () => ({ upsertNodeSnapshot: vi.fn() }));
vi.mock('../database/searchIndexInvalidationCoalescer.js', () => ({ enqueueCoalescedWorkspaceSearchInvalidation: vi.fn() }));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));
vi.mock('./workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

it('returns every affected Topic when a Collection virtual folder is renamed', () => {
  vi.mocked(readAgentVirtualFolderRow).mockReturnValue({
    created_at: '2026-03-06T00:00:00.000Z', deleted_at: null, id: 'virtual-1', manual_child_order: null,
    title: 'Old', updated_at: '2026-03-06T00:00:00.000Z', virtual_filter: null
  });
  vi.mocked(renameCollectionVirtualFolder).mockReturnValue({
    collectionRenames: [{ from: 'Old', nodeIds: ['topic-1'], to: 'New' }], folder_id: 'virtual-1',
    nodes: [snapshot('virtual-1', 'folder'), snapshot('topic-1', 'topic')], title: 'New',
    updated_at: '2026-03-06T00:00:01.000Z', updatedNodeIds: ['virtual-1', 'topic-1']
  });

  expect(handleNodeMutationCommand('update_node_content', snapshot('virtual-1', 'folder'))).toMatchObject({
    collectionRenames: [{ from: 'Old', nodeIds: ['topic-1'], to: 'New' }],
    nodes: [expect.objectContaining({ nodeId: 'virtual-1' }), expect.objectContaining({ nodeId: 'topic-1' })],
    updatedNodeIds: ['virtual-1', 'topic-1']
  });
  expect(renameCollectionVirtualFolder).toHaveBeenCalledWith(expect.objectContaining({
    expectedUpdatedAt: '2026-03-06T00:00:00.000Z', id: 'virtual-1', title: 'New'
  }));
  expect(upsertNodeSnapshot).not.toHaveBeenCalled();
});

function snapshot(nodeId: string, kind: 'folder' | 'topic') {
  return {
    anchorLink: null, content: '', createdAt: '2026-03-06T00:00:00.000Z', isTitleManual: true,
    kind, nodeId, parentNodeId: kind === 'folder' ? 'special-virtual-root' : null, position: 1,
    reveal: null, title: nodeId === 'virtual-1' ? 'New' : 'Topic', updatedAt: '2026-03-06T00:00:01.000Z'
  };
}
