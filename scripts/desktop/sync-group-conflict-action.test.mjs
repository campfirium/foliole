import { createHash } from 'node:crypto';

import { expect, it, vi } from 'vitest';

import {
  createDesktopSyncConflictSeed, forkDesktopSyncConflict, loadConvergedDesktopSyncForks,
  loadVisibleDesktopSyncConflict, loadVisibleDesktopSyncConflictBodies
} from './sync-group-conflict-action.mjs';

it('creates and forks one business object only through product commands', async () => {
  const invoke = vi.fn(async (command, args) => {
    if (command === 'load_workspace_list_snapshot') return { nodeOrder: [], nodesById: {
      node: { content: 'Note target beta.', createdAt: '2026-08-29T00:00:00.000Z',
        isTitleManual: false, kind: 'topic', nodeId: 'node', parentNodeId: 'special-inbox',
        position: 0, title: 'Seed', updatedAt: '2026-08-29T00:00:00.000Z' }
    } };
    if (command === 'load_node_document') return { nodeId: args.nodeId, content: 'Note target beta.',
      updatedAt: '2026-08-29T00:00:00.000Z' };
    if (command === 'create_topic') return { createdNodeIds: [args.nodeId] };
    if (command === 'update_node_content') return { updatedNodeIds: [args.nodeId] };
    return [];
  });
  const seed = await createDesktopSyncConflictSeed({ evidenceRoot: '/tmp/t152-conflict-test',
    now: () => new Date('2026-08-29T00:00:00.000Z'), session: { invoke } });
  expect(seed.nodeId).toContain('multi-device-sync-conflict');
  const fork = await forkDesktopSyncConflict({ label: 'macos', nodeId: 'node', session: { invoke } });
  expect(fork.content).toBe(`Note target beta.\n\nDesktop fork macos ${fork.updatedAt}`);
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

const MAC_BODY = 'Original complete paragraph.\n\nDesktop fork macos 2026-11-06T12:00:00.000Z';
const WINDOWS_BODY = 'Original complete paragraph.\n\nDesktop fork windows 2026-11-06T12:00:01.000Z';

function forkBodies(current = MAC_BODY, alternate = 'Original complete paragraph.\n\nFri conflict fork') {
  const entry = { id: 'alternative#peer', body_blob_hash: createHash('sha256').update(alternate).digest('hex'),
    source_host_name: 'peer', created_at: '2026-11-06T12:00:00.000Z', expires_at: '2026-12-06T12:00:00.000Z' };
  const preview = { source_node_id: 'node', alternative_id: entry.id,
    current_content: current, updated_content: alternate, alternatives: [entry] };
  const session = { waitForState: vi.fn(async () => preview), invoke: vi.fn(async command =>
    command === 'load_node_document' ? { nodeId: 'node', content: current, currentVersionId: 'current#2' } : preview) };
  return { entry, preview, session };
}

it('retains separate complete Fri and desktop fork bodies on their original node', async () => {
  const { session } = forkBodies();
  await expect(loadConvergedDesktopSyncForks({ nodeId: 'node', session }))
    .resolves.toMatchObject({ resolution: 'body-alternatives', currentContent: MAC_BODY,
      currentVersionId: 'current#2', silentOverwrite: false, visible: true });
  expect(session.waitForState).toHaveBeenCalledWith({ command: 'load_node_text_alternative_preview',
    commandArgs: { node_id: 'node' }, condition: { fragments: [
      'Fri conflict fork', 'Desktop fork macos'
    ], kind: 'body-alternative-preview', nodeId: 'node' },
    eventName: 'onWorkspaceSyncApplied', timeoutMs: 120_000 });
});

it('accepts exact Windows and Mac writer bodies rather than requiring a Fri fragment', async () => {
  const { session, entry } = forkBodies(WINDOWS_BODY, MAC_BODY);
  await expect(loadConvergedDesktopSyncForks({ desktopLabel: 'windows', nodeId: 'node',
    peerFragment: 'Desktop fork macos', expectedContent: WINDOWS_BODY, session }))
    .resolves.toMatchObject({ currentContent: WINDOWS_BODY, alternatives: [{ ...entry, content: MAC_BODY }] });
  expect(session.waitForState).toHaveBeenCalledWith(expect.objectContaining({ condition: expect.objectContaining({
    fragments: ['Desktop fork macos', 'Desktop fork windows']
  }) }));
});

it.each(['truncated', 'combined', 'other-node', 'other-id', 'hash', 'version', 'current-body'])(
  'rejects %s evidence instead of claiming complete fork preservation', async fault => {
    const { preview, session } = forkBodies(WINDOWS_BODY, MAC_BODY);
    if (fault === 'truncated') preview.current_content = 'Desktop fork windows';
    if (fault === 'combined') {
      preview.updated_content = `${MAC_BODY}\n${WINDOWS_BODY}`;
      preview.alternatives[0].body_blob_hash = createHash('sha256').update(preview.updated_content).digest('hex');
    }
    if (fault === 'other-node') preview.source_node_id = 'different-node';
    if (fault === 'other-id') preview.alternative_id = 'unknown-alternative';
    if (fault === 'hash') preview.alternatives[0].body_blob_hash = '0'.repeat(64);
    if (fault === 'version') session.invoke = async () => ({ nodeId: 'node', content: WINDOWS_BODY });
    if (fault === 'current-body') session.invoke = async () => ({ nodeId: 'node', content: 'another body', currentVersionId: 'current#2' });
    await expect(loadConvergedDesktopSyncForks({ desktopLabel: 'windows', nodeId: 'node',
      peerFragment: 'Desktop fork macos', expectedContent: WINDOWS_BODY, session })).rejects.toThrow();
  });

it.each(['complete', 'other-node', 'other-id', 'other-list'])(
  'reads every listed alternative with stable original-node identity: %s', async mode => {
    const { preview, session } = forkBodies(WINDOWS_BODY, MAC_BODY);
    const text = 'Complete third independent body.';
    const entry = { ...preview.alternatives[0], id: 'alternative#third',
      body_blob_hash: createHash('sha256').update(text).digest('hex') };
    preview.alternatives.push(entry);
    session.invoke = vi.fn(async (command, args) => {
      if (command === 'load_node_document') return { nodeId: 'node', content: WINDOWS_BODY, currentVersionId: 'current#2' };
      expect(args).toEqual({ node_id: 'node', alternative_id: entry.id });
      return { ...preview, alternative_id: mode === 'other-id' ? 'wrong-id' : entry.id,
        source_node_id: mode === 'other-node' ? 'wrong-node' : 'node', updated_content: text,
        alternatives: mode === 'other-list' ? [entry] : preview.alternatives };
    });
    const reading = loadConvergedDesktopSyncForks({ desktopLabel: 'windows', nodeId: 'node',
      peerFragment: 'Desktop fork macos', expectedContent: WINDOWS_BODY, session });
    if (mode !== 'complete') await expect(reading).rejects.toThrow();
    else await expect(reading).resolves.toMatchObject({ alternatives: expect.arrayContaining([{ ...entry, content: text }]) });
  });

it('accepts both fork bodies on the original node without a renamed copy', async () => {
  const invoke = vi.fn(async () => ({ source_node_id: 'node', alternative_id: 'other',
    alternatives: [{ id: 'other' }], current_content: 'Note target beta\nDesktop fork macos',
    updated_content: 'Note target beta\nA5 note token' }));
  await expect(loadVisibleDesktopSyncConflictBodies({ nodeId: 'node', session: { invoke } }))
    .resolves.toMatchObject({ conflictCount: 1, silentOverwrite: false, visible: true });
  expect(invoke).toHaveBeenCalledWith('load_node_text_alternative_preview', { node_id: 'node' });
});

it('rejects loss of either fork or an alternative from another node', async () => {
  for (const preview of [null,
    { source_node_id: 'node', current_content: 'A5 note', updated_content: 'unrelated' },
    { source_node_id: 'node', current_content: 'Desktop fork macos', updated_content: 'unrelated' },
    { source_node_id: 'other', current_content: 'Desktop fork macos', updated_content: 'A5 note' }]) {
    await expect(loadVisibleDesktopSyncConflictBodies({ nodeId: 'node', session: {
      invoke: async () => preview && { alternative_id: 'other', alternatives: [{ id: 'other' }], ...preview }
    } })).rejects.toThrow();
  }
});

it('preserves the hydrated body when the workspace list contains metadata only', async () => {
  const invoke = vi.fn(async (command, args) => {
    if (command === 'load_workspace_list_snapshot') return { nodesById: {
      node: { nodeId: 'node', title: 'Seed', content: '', updatedAt: '2026-08-29T00:00:00.000Z' }
    } };
    if (command === 'load_node_document') return { nodeId: 'node', content: 'Original seed body',
      currentVersionId: 'base', updatedAt: '2026-08-29T00:00:00.000Z' };
    if (command === 'update_node_content') return { updatedNodeIds: [args.nodeId] };
    throw new Error('Unexpected command');
  });
  await forkDesktopSyncConflict({ label: 'windows', nodeId: 'node', session: { invoke } });
  expect(invoke).toHaveBeenCalledWith('update_node_content', expect.objectContaining({
    nodeId: 'node', content: expect.stringMatching(/^Original seed body\n\nDesktop fork windows /u)
  }));
});
