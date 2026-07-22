// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

import { deleteNodesPermanently, moveNodes, replaceNodeOrder, restoreNodes, softDeleteNodes, upsertNodeSnapshot, upsertNodeSnapshotWithOrder } from '../database/nodeMutations.js';
import { enqueueCoalescedWorkspaceSearchInvalidation } from '../database/searchIndexInvalidationCoalescer.js';

import { handleInvokeRequest } from './commands.js';

const mockWindow = { close: vi.fn(), isMaximized: vi.fn(() => false), maximize: vi.fn(), minimize: vi.fn(), unmaximize: vi.fn() };

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(() => mockWindow),
    getFocusedWindow: vi.fn(() => mockWindow)
  },
  app: { getVersion: () => '1.0.0' },
  shell: { openExternal: vi.fn().mockResolvedValue(undefined) }
}));
vi.mock('./menu.js', () => ({ syncAppMenuState: vi.fn() }));
vi.mock('./paths.js', () => ({
  resolveAppPaths: vi.fn().mockReturnValue({
    app_data_dir: '/data',
    app_config_dir: '/config',
    app_cache_dir: '/cache',
    app_log_dir: '/log'
  })
}));
vi.mock('../database/nodeMutations.js', () => ({
  deleteNodesPermanently: vi.fn(),
  flushAllDirtyNodeSyncVersions: vi.fn(),
  moveNodes: vi.fn(),
  replaceNodeOrder: vi.fn(),
  restoreNodes: vi.fn(),
  softDeleteNodes: vi.fn(),
  updateNodeAnchorLinks: vi.fn(),
  upsertNodeSnapshot: vi.fn(),
  upsertNodeSnapshotWithOrder: vi.fn()
}));
vi.mock('../database/searchIndexInvalidationCoalescer.js', () => ({
  enqueueCoalescedWorkspaceSearchInvalidation: vi.fn()
}));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({
  scheduleMirrorSync: vi.fn()
}));
vi.mock('../agentControl/agentControlVirtualFolderLifecycle.js', () => ({ renameCollectionVirtualFolder: vi.fn() }));
vi.mock('../agentControl/agentControlVirtualFolders.js', () => ({ readCollectionVirtualFolderRow: vi.fn(() => null) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(deleteNodesPermanently).mockReturnValue([]);
  vi.mocked(moveNodes).mockReturnValue({ movedNodeIds: ['node-2'], nodeOrder: ['node-1', 'node-2'] });
  vi.mocked(restoreNodes).mockReturnValue({ restoredNodeIds: ['node-1'], skippedConflicts: [] });
});

it('handles node mutation commands', async () => {
  await expect(
    handleInvokeRequest({
      command: 'update_node_content',
      args: {
        nodeId: 'node-1',
        parentNodeId: null,
        kind: 'topic',
        title: 'Node title',
        isTitleManual: false,
        shelvedAt: '2026-05-27T00:00:00.000Z',
        content: '# Content',
        reveal: null,
        anchorLink: null,
        position: 1,
        createdAt: '2026-03-06T00:00:00.000Z',
        updatedAt: '2026-03-06T00:00:01.000Z'
      }
    })
  ).resolves.toEqual({
    nodes: [expect.objectContaining({
      content: '# Content',
      nodeId: 'node-1'
    })],
    updatedNodeIds: ['node-1']
  });
  expect(upsertNodeSnapshot).toHaveBeenCalledWith(
    expect.objectContaining({
      anchorLink: null,
      content: '# Content',
      kind: 'topic',
      nodeId: 'node-1',
      reveal: null,
      shelvedAt: '2026-05-27T00:00:00.000Z'
    }),
    { searchInvalidation: { workspaceInvalidation: 'defer' } }
  );
  expect(enqueueCoalescedWorkspaceSearchInvalidation).toHaveBeenCalledWith(['node-1']);
});

it('handles node reveal mutation command', async () => {
  await expect(
    handleInvokeRequest({
      command: 'update_node_reveal',
      args: {
        nodeId: 'node-2',
        parentNodeId: 'node-1',
        kind: 'item',
        title: 'QA',
        isTitleManual: true,
        content: 'Question',
        reveal: 'Answer',
        anchorLink: { id: 'cloze-1', kind: 'cloze' },
        position: 2,
        createdAt: '2026-03-06T00:00:00.000Z',
        updatedAt: '2026-03-06T00:00:02.000Z'
      }
    })
  ).resolves.toEqual({
    nodes: [expect.objectContaining({
      nodeId: 'node-2',
      reveal: 'Answer'
    })],
    updatedNodeIds: ['node-2']
  });
  expect(upsertNodeSnapshot).toHaveBeenCalledWith(
    expect.objectContaining({
      anchorLink: { id: 'cloze-1', kind: 'cloze' },
      content: 'Question',
      kind: 'item',
      nodeId: 'node-2',
      reveal: 'Answer'
    }),
    { searchInvalidation: { workspaceInvalidation: 'defer' } }
  );
  expect(enqueueCoalescedWorkspaceSearchInvalidation).toHaveBeenCalledWith(['node-2']);
});

it('handles create node mutation command with accepted order patch', async () => {
  await expect(
    handleInvokeRequest({
      command: 'create_topic',
      args: {
        activeNodeId: 'node-new',
        nodeId: 'node-new',
        nodeOrder: ['special-inbox', 'node-new'],
        parentNodeId: 'special-inbox',
        kind: 'topic',
        title: 'New node',
        isTitleManual: false,
        content: 'New body',
        reveal: null,
        anchorLink: null,
        position: 1,
        createdAt: '2026-03-06T00:00:00.000Z',
        updatedAt: '2026-03-06T00:00:01.000Z'
      }
    })
  ).resolves.toEqual({
    activeNodeId: 'node-new',
    createdNodeIds: ['node-new'],
    nodeOrder: ['special-inbox', 'node-new'],
    nodes: [expect.objectContaining({ nodeId: 'node-new', title: 'New node' })]
  });
  expect(upsertNodeSnapshotWithOrder).toHaveBeenCalledWith(
    expect.objectContaining({ nodeId: 'node-new' }),
    ['special-inbox', 'node-new']
  );
});

it('handles node order replacement command', async () => {
  await expect(
    handleInvokeRequest({
      command: 'replace_node_order',
      args: { nodeIds: ['node-1', 'node-2'] }
    })
  ).resolves.toBeNull();
  expect(replaceNodeOrder).toHaveBeenCalledWith(['node-1', 'node-2']);
});

it('handles move nodes command', async () => {
  const args = {
    nodeOrder: ['node-1', 'node-2'],
    nodes: [{
      nodeId: 'node-2',
      parentNodeId: 'node-1',
      sequentialReadingEnabled: null,
      updatedAt: '2026-03-06T00:00:02.000Z'
    }]
  };

  await expect(handleInvokeRequest({ command: 'move_nodes', args })).resolves.toEqual({
    movedNodeIds: ['node-2'],
    nodeOrder: ['node-1', 'node-2']
  });
  expect(moveNodes).toHaveBeenCalledWith(args);
});

it('handles soft delete node command', async () => {
  await expect(
    handleInvokeRequest({
      command: 'soft_delete_nodes',
      args: {
        nodeIds: ['node-1', 'node-2'],
        deletedAt: '2026-03-06T00:00:00.000Z'
      }
    })
  ).resolves.toEqual({ deletedNodeIds: ['node-1', 'node-2'] });
  expect(softDeleteNodes).toHaveBeenCalledWith({
    nodeIds: ['node-1', 'node-2'],
    deletedAt: '2026-03-06T00:00:00.000Z'
  });
});

it('handles restore and permanent delete node commands', async () => {
  await expect(handleInvokeRequest({ command: 'restore_nodes', args: { nodeIds: ['node-1'] } })).resolves.toEqual({
    restoredNodeIds: ['node-1'],
    skippedConflicts: []
  });
  expect(restoreNodes).toHaveBeenCalledWith({ nodeIds: ['node-1'] });

  await expect(
    handleInvokeRequest({
      command: 'delete_nodes_permanently',
      args: {
        nodeIds: ['node-3'],
        nodeOrder: ['node-1', 'node-2']
      }
    })
  ).resolves.toEqual({ nodeOrder: ['node-1', 'node-2'], removedNodeIds: ['node-3'] });
  expect(deleteNodesPermanently).toHaveBeenCalledWith({
    nodeIds: ['node-3'],
    nodeOrder: ['node-1', 'node-2']
  });
});
