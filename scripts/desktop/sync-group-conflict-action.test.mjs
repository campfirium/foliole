import { expect, it, vi } from 'vitest';

import {
  createDesktopSyncConflictSeed, forkDesktopSyncConflict, loadConvergedDesktopSyncForks,
  loadVisibleDesktopSyncConflict, loadVisibleDesktopSyncConflictCopy
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

it('creates an existing highlight as the shared conflict object', async () => {
  const invoke = vi.fn(async (command, args) => command === 'create_topic'
    ? { createdNodeIds: [args.nodeId] } : { nodeOrder: [], nodesById: {} });
  const seed = await createDesktopSyncConflictSeed({ evidenceRoot: '/tmp/t152-highlight-conflict-test',
    existingHighlight: true, now: () => new Date('2026-08-29T00:00:00.000Z'), session: { invoke } });
  expect(seed.nodeId).toBe(`${seed.topicNodeId}-highlight`);
  expect(invoke).toHaveBeenLastCalledWith('create_topic', expect.objectContaining({
    anchorLink: expect.objectContaining({ kind: 'highlight' }), nodeId: seed.nodeId,
    parentNodeId: seed.topicNodeId
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

it('waits for the applied sync event before accepting a product conflict', async () => {
  const waitForState = vi.fn(async () => [{ conflict_version_id: 'peer#2', object_id: 'node' }]);
  await expect(loadVisibleDesktopSyncConflict({ nodeId: 'node', session: { waitForState } }))
    .resolves.toMatchObject({ conflictCount: 1, visible: true });
  expect(waitForState).toHaveBeenCalledWith({ command: 'load_sync_node_conflicts',
    commandArgs: { objectIds: ['node'] }, condition: { count: 1, kind: 'sync-conflict-count' },
    eventName: 'onWorkspaceSyncApplied', timeoutMs: 120_000 });
});

it('accepts both concurrent content forks on the exact product object', async () => {
  const waitForState = vi.fn(async () => ({
    content: 'Fri conflict fork\nDesktop fork macos', nodeId: 'node'
  }));
  await expect(loadConvergedDesktopSyncForks({ nodeId: 'node', session: { waitForState } }))
    .resolves.toMatchObject({ resolution: 'merged-content', silentOverwrite: false, visible: true });
  expect(waitForState).toHaveBeenCalledWith({ command: 'load_node_document',
    commandArgs: { nodeId: 'node' }, condition: { fragments: [
      'Fri conflict fork', 'Desktop fork macos'
    ], kind: 'node-content-includes', nodeId: 'node' },
    eventName: 'onWorkspaceSyncApplied', timeoutMs: 120_000 });
});

it('accepts the actual Windows peer label when requested', async () => {
  const waitForState = vi.fn(async () => ({
    content: 'Fri conflict fork\nDesktop fork windows', nodeId: 'node'
  }));
  await expect(loadConvergedDesktopSyncForks({ desktopLabel: 'windows', nodeId: 'node',
    session: { waitForState } })).resolves.toMatchObject({ resolution: 'merged-content' });
  expect(waitForState).toHaveBeenCalledWith(expect.objectContaining({ condition: expect.objectContaining({
    fragments: ['Fri conflict fork', 'Desktop fork windows']
  }) }));
});

it('loads and accepts an A5 conflict copy exposed by the product snapshot', async () => {
  const invoke = vi.fn(async (command) => command === 'load_workspace_list_snapshot'
    ? { nodesById: { 'node~a5': { content: '' } } }
    : { content: 'Note target beta\n※ A5 note token' });
  const session = { invoke };
  await expect(loadVisibleDesktopSyncConflictCopy({ nodeId: 'node', session }))
    .resolves.toMatchObject({ conflictCount: 1, silentOverwrite: false, visible: true });
  expect(invoke).toHaveBeenCalledWith('load_node_document', { nodeId: 'node~a5' });
});
