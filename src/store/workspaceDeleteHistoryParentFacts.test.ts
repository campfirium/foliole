import { afterEach, expect, it } from 'vitest';

import { applyWorkspaceDeleteHistory } from './workspaceDeleteHistoryApply';
import { createWorkspaceDeleteHistoryEntry } from './workspaceDeleteHistoryEntry';
import { createBrowserLocalWorkspaceMutationRepository, installWorkspaceMutationRepository,
  resetWorkspaceMutationRepository } from './workspaceMutationRepository';
import { createWorkspaceNodeActionsFixture } from './workspaceStoreNodeActions.test-support';
import { computeDeleteNodesMutation } from './workspaceTrashMutations';

afterEach(() => resetWorkspaceMutationRepository());

it('restores only parent image facts while retaining its latest reading and resource facts', async () => {
  const repository = createBrowserLocalWorkspaceMutationRepository();
  let release!: () => void;
  installWorkspaceMutationRepository({ ...repository, syncRestoreNodes: async args => {
    const result = await repository.syncRestoreNodes(args);
    await new Promise<void>(resolve => { release = resolve; });
    return result;
  } });
  const state = createWorkspaceNodeActionsFixture();
  const original = state.nodesById['node-1']!;
  const imageRegions = [{ attachmentId: 'image', regions: [{ id: 'region', x: 0, y: 0, width: 0.5, height: 0.5 }] }];
  state.nodesById['node-1'] = { ...original, imageRegions };
  state.nodesById.child = { ...original, id: 'child', kind: 'item', parentNodeId: 'node-1',
    anchorLink: { id: 'region', kind: 'cloze', locator: { attachmentId: 'image', x: 0, y: 0, width: 0.5, height: 0.5 } } };
  state.nodeOrder = [...state.nodeOrder, 'child'];
  const mutation = computeDeleteNodesMutation(state, ['child'])!;
  const after = { ...state, ...mutation.patch };
  const entry = createWorkspaceDeleteHistoryEntry({ beforeState: state, afterState: after,
    mutation, kind: 'item', rootNodeId: 'child' });
  const reading = { intervalDurationMs: 1000, intervalGrowthFactor: 1.5, lastHandledAt: '2026-10-29T00:00:00.000Z',
    nextAt: '2030-01-01T00:00:00.000Z', priority: 3, readingPosition: 0.4, repetitionCount: 2, state: 'active' as const };
  let latest = after;
  const pending = applyWorkspaceDeleteHistory({ entry, get: () => latest, mode: 'undo',
    mutationTimestamp: '2026-10-29T01:00:00.000Z' });
  latest = { ...after, nodesById: { ...after.nodesById,
    'node-1': { ...after.nodesById['node-1']!, reading, imageSources: { 'new-image.png': 'https://example.test/image.png' } } } };
  await Promise.resolve();
  release();
  const result = await pending;
  expect(result.status).toBe('applied');
  if (result.status !== 'applied') throw new Error('restore failed');
  expect(result.patch.nodesById?.['node-1']).toMatchObject({ reading, imageRegions,
    imageSources: latest.nodesById['node-1']!.imageSources, content: original.content });
});

it('keeps a later manual-order edit when an older restore receipt arrives', async () => {
  const state = createWorkspaceNodeActionsFixture();
  const parent = { ...state.nodesById['node-1']!, kind: 'folder' as const, manualChildOrder: ['a', 'x', 'b', 'y'] };
  state.nodesById['node-1'] = parent;
  for (const id of ['a', 'x', 'b', 'y']) state.nodesById[id] = { ...parent, id, kind: 'topic', parentNodeId: parent.id };
  state.nodeOrder = [...state.nodeOrder, 'a', 'x', 'b', 'y'];
  const mutation = computeDeleteNodesMutation(state, ['x'])!;
  let latest = { ...state, ...mutation.patch };
  const entry = createWorkspaceDeleteHistoryEntry({ beforeState: state, afterState: latest,
    mutation, kind: 'topic', rootNodeId: 'x' });
  let release!: () => void;
  installWorkspaceMutationRepository({ ...createBrowserLocalWorkspaceMutationRepository(), syncRestoreNodes: async () => {
    await new Promise<void>(resolve => { release = resolve; });
    return { restoredNodeIds: ['x'], skippedConflicts: [], manualParentOrders: [{ parentNodeId: parent.id,
      childIds: ['a', 'x', 'b', 'y'], updatedAt: '2026-10-29T01:00:00.000Z' }] };
  } });
  const pending = applyWorkspaceDeleteHistory({ entry, get: () => latest, mode: 'undo',
    mutationTimestamp: '2026-10-29T01:00:00.000Z' });
  latest = { ...latest, nodesById: { ...latest.nodesById, [parent.id]: { ...parent, manualChildOrder: ['b', 'y', 'a'] } } };
  release();
  const result = await pending;
  expect(result.status).toBe('applied');
  if (result.status !== 'applied') throw new Error('restore failed');
  expect(result.patch.nodesById?.[parent.id]?.manualChildOrder).toEqual(['b', 'y', 'a']);
});
