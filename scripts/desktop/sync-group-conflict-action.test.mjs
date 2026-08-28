import { expect, it, vi } from 'vitest';

import {
  createDesktopSyncConflictSeed, forkDesktopSyncConflict, loadVisibleDesktopSyncConflict
} from './sync-group-conflict-action.mjs';

it('creates and forks one business object only through product commands', async () => {
  const invoke = vi.fn(async (command, args) => {
    if (command === 'load_workspace_list_snapshot') return { nodeOrder: [], nodesById: {
      node: { content: 'Note target beta.', createdAt: '2026-08-29T00:00:00.000Z',
        isTitleManual: false, kind: 'topic', nodeId: 'node', parentNodeId: 'special-inbox',
        position: 0, title: 'Seed', updatedAt: '2026-08-29T00:00:00.000Z' }
    } };
    if (command === 'create_topic') return { createdNodeIds: [args.nodeId] };
    if (command === 'update_node_content') return { updatedNodeIds: [args.nodeId] };
    return [];
  });
  const seed = await createDesktopSyncConflictSeed({ evidenceRoot: '/tmp/t152-conflict-test',
    now: () => new Date('2026-08-29T00:00:00.000Z'), session: { invoke } });
  expect(seed.nodeId).toContain('multi-device-sync-conflict');
  await forkDesktopSyncConflict({ label: 'macos', nodeId: 'node', session: { invoke } });
  expect(invoke).toHaveBeenCalledWith('update_node_content', expect.objectContaining({
    nodeId: 'node'
  }));
});

it('accepts only a product conflict record for the exact object', async () => {
  await expect(loadVisibleDesktopSyncConflict({ nodeId: 'node', session: {
    invoke: async () => [{ conflict_version_id: 'peer#2', object_id: 'node' }]
  } })).resolves.toMatchObject({ silentOverwrite: false, visible: true });
  await expect(loadVisibleDesktopSyncConflict({ nodeId: 'node', session: {
    invoke: async () => []
  } })).rejects.toThrow('did not expose');
});
