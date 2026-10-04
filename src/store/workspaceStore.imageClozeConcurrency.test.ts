import { beforeEach, expect, it, vi } from 'vitest';

import { createEmptyEditorOperationHistory, getEditorOperationSession } from '../features/editor/model/editorOperationHistory';
import { deriveImageClozeRegionsFromChildren } from '../features/image-cloze/model/imageCloze';

import { createEmptyWorkspaceActionHistory } from './workspaceActionHistory';
import { useWorkspaceStore } from './workspaceStore';
import { createWorkspaceNodeActionsFixture } from './workspaceStoreNodeActions.test-support';

const runtimeInvoke = vi.hoisted(() => vi.fn());
vi.mock('../../lib/platform/storage', () => ({
  nodeStorage: { listNodeOrder: vi.fn(), loadNodes: vi.fn(), saveNode: vi.fn(), saveNodeOrder: vi.fn() }
}));
vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => runtimeInvoke }));

const region = { id: 'region-1', attachmentId: 'image', answer: 'Answer', x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
const source = { promptContent: '![Image](asset://image.png)', revealContent: '![Image](asset://image.png)' };

beforeEach(() => {
  runtimeInvoke.mockReset();
  runtimeInvoke.mockImplementation(async (command: string, payload: { nodeIds?: string[]; nodeId?: string; nodeOrder?: string[] }) => {
    if (['create_item', 'create_topic', 'create_folder'].includes(command)) return { createdNodeIds: [payload.nodeId], nodeOrder: payload.nodeOrder, nodes: [] };
    if (command === 'update_node_content') return { nodes: [payload], updatedNodeIds: [payload.nodeId] };
    if (command === 'update_node_content_with_anchors') return { nodes: [] };
    if (command === 'restore_nodes') return { restoredNodeIds: payload.nodeIds, skippedConflicts: [] };
    if (command === 'soft_delete_nodes') return { deletedNodeIds: payload.nodeIds };
    return null;
  });
  const fixture = createWorkspaceNodeActionsFixture();
  useWorkspaceStore.persist.clearStorage();
  useWorkspaceStore.setState({
    nodesById: fixture.nodesById, nodeOrder: fixture.nodeOrder, activeNodeId: 'node-1',
    navigation: fixture.navigation, reviewSession: fixture.reviewSession,
    trashedNodeIds: [], trashedNodeDeletedAtById: {},
    editorOperationHistory: createEmptyEditorOperationHistory(), appActionHistory: createEmptyWorkspaceActionHistory()
  });
});

async function seedRegion() {
  const [id] = await useWorkspaceStore.getState().createImageClozeNodes('node-1', 'image', source, [region]);
  if (!id) throw new Error('Expected image cloze node');
  return id;
}

function deferDelete() {
  let resolve!: (result: { deletedNodeIds: string[] }) => void;
  const receipt = new Promise<{ deletedNodeIds: string[] }>((done) => { resolve = done; });
  runtimeInvoke.mockImplementationOnce(() => receipt);
  const deletion = useWorkspaceStore.getState().deleteImageClozeRegion('node-1', 'image', 'region-1');
  return { deletion, resolve };
}

it('preserves edits, creation, navigation and review changes made while deletion awaits its receipt', async () => {
  const id = await seedRegion();
  const { deletion, resolve } = deferDelete();
  expect(useWorkspaceStore.getState().trashedNodeIds).not.toContain(id);
  await useWorkspaceStore.getState().updateNodeTitle('node-1', 'Edited during deletion');
  const created = await useWorkspaceStore.getState().createRootNode('Created during deletion');
  if (!created) throw new Error('Expected concurrent creation');
  expect(await useWorkspaceStore.getState().updateNodeContent(created, 'Edited new content')).toBe(true);
  useWorkspaceStore.getState().openNode('node-1');
  useWorkspaceStore.getState().openNode(created);
  useWorkspaceStore.setState((state) => ({ reviewSession: {
    ...state.reviewSession, completedAt: null, currentNodeId: created, queueNodeIds: [created], totalNodeCount: 3, isAnswerRevealed: true
  } }));
  const current = useWorkspaceStore.getState();
  expect(current.nodesById['node-1']?.title).toBe('Edited during deletion');
  resolve({ deletedNodeIds: [id] });
  await deletion;
  const final = useWorkspaceStore.getState();
  expect(final.nodesById['node-1']?.title).toBe('Edited during deletion');
  expect(final.nodesById[created]).toEqual(current.nodesById[created]);
  expect(final.nodeOrder).toEqual(current.nodeOrder);
  expect(final.activeNodeId).toBe(created);
  expect(final.navigation).toEqual({
    backStack: current.navigation.backStack.filter((nodeId) => nodeId !== id),
    forwardStack: current.navigation.forwardStack.filter((nodeId) => nodeId !== id)
  });
  expect(final.reviewSession).toEqual(current.reviewSession);
  expect(final.trashedNodeIds).toContain(id);
  expect(final.nodesById['node-1']?.imageRegions).toBeNull();
  expect(getEditorOperationSession(final.editorOperationHistory, 'node-1').undoStack.at(-1)?.type).toBe('annotation.delete');
  useWorkspaceStore.getState().openNode('node-1');
  expect(useWorkspaceStore.getState().undoEditorOperation()).toBe(true);
  await vi.waitFor(() => expect(useWorkspaceStore.getState().trashedNodeIds).not.toContain(id));
  expect(useWorkspaceStore.getState().nodesById[created]).toEqual(current.nodesById[created]);
  expect(deriveImageClozeRegionsFromChildren({ nodeId: 'node-1', ...useWorkspaceStore.getState() })[0]?.regions[0]?.id).toBe(region.id);
});

it('does not mutate the previous store snapshot when appending to an existing image group', async () => {
  await seedRegion();
  const previous = useWorkspaceStore.getState().nodesById['node-1']!;
  const snapshot = structuredClone(previous);
  await useWorkspaceStore.getState().createImageClozeNodes('node-1', 'image', source, [{ ...region, id: 'region-2' }]);
  expect(previous).toEqual(snapshot);
  expect(useWorkspaceStore.getState().nodesById['node-1']?.imageRegions?.[0]?.regions.map((entry) => entry.id))
    .toEqual(['region-1', 'region-2']);
});

it.each([{ deletedNodeIds: [] }, { deletedNodeIds: ['unexpected'] }])(
  'does not publish rejected receipt $deletedNodeIds', async ({ deletedNodeIds }) => {
  await seedRegion();
  const { deletion, resolve } = deferDelete();
  await useWorkspaceStore.getState().updateNodeContent('node-1', 'Latest');
  const latest = useWorkspaceStore.getState();
  resolve({ deletedNodeIds });
  await deletion;
  expect(useWorkspaceStore.getState().nodesById).toBe(latest.nodesById);
  expect(useWorkspaceStore.getState().editorOperationHistory).toBe(latest.editorOperationHistory);
  expect(useWorkspaceStore.getState().trashedNodeIds).toEqual([]);
});

it('keeps a newly added region on the current parent and removes a legacy region by its explicit id', async () => {
  const id = await seedRegion();
  useWorkspaceStore.setState((state) => ({ nodesById: { ...state.nodesById,
    [id]: { ...state.nodesById[id]!, anchorLink: { ...state.nodesById[id]!.anchorLink!, id: 'legacy' }, imageRegions: null }
  } }));
  const { deletion, resolve } = deferDelete();
  await useWorkspaceStore.getState().createImageClozeNodes('node-1', 'image', source, [{ ...region, id: 'region-2' }]);
  resolve({ deletedNodeIds: [id] });
  await deletion;
  expect(useWorkspaceStore.getState().nodesById['node-1']?.imageRegions?.[0]?.regions.map((entry) => entry.id)).toEqual(['region-2']);
});

function addRelatedNode(id: string, parentNodeId: string, templateId: string) {
  useWorkspaceStore.setState((state) => ({
    nodeOrder: [...state.nodeOrder, id],
    nodesById: { ...state.nodesById, [id]: { ...state.nodesById[templateId]!, id, parentNodeId } }
  }));
}

it.each(['partial', 'duplicate', 'extra'])('rejects a %s receipt without changing current state or undo', async (kind) => {
  const id = await seedRegion();
  addRelatedNode('sibling', 'node-1', id);
  const { deletion, resolve } = deferDelete();
  await useWorkspaceStore.getState().updateNodeContent('node-1', 'Latest parent');
  const latest = useWorkspaceStore.getState();
  const deletedNodeIds = kind === 'partial' ? [id] : kind === 'duplicate' ? [id, id] : [id, 'sibling', 'extra'];
  resolve({ deletedNodeIds });
  await deletion;
  expect(useWorkspaceStore.getState().nodesById).toBe(latest.nodesById);
  expect(useWorkspaceStore.getState().editorOperationHistory).toBe(latest.editorOperationHistory);
  expect(useWorkspaceStore.getState().trashedNodeIds).toEqual([]);
});

it('applies only receipt ids even when descendants are added or moved during the wait', async () => {
  const id = await seedRegion();
  addRelatedNode('old-descendant', id, id);
  const { deletion, resolve } = deferDelete();
  addRelatedNode('new-descendant', id, id);
  useWorkspaceStore.setState((state) => ({ nodesById: {
    ...state.nodesById, 'old-descendant': { ...state.nodesById['old-descendant']!, parentNodeId: 'node-1' }
  } }));
  resolve({ deletedNodeIds: ['old-descendant', id] });
  await deletion;
  expect(useWorkspaceStore.getState().trashedNodeIds).toEqual(expect.arrayContaining([id, 'old-descendant']));
  expect(useWorkspaceStore.getState().trashedNodeIds).not.toContain('new-descendant');
  expect(useWorkspaceStore.getState().nodesById['new-descendant']?.parentNodeId).toBe(id);
  const entry = getEditorOperationSession(useWorkspaceStore.getState().editorOperationHistory, 'node-1').undoStack.at(-1);
  expect(entry).toMatchObject({ annotations: [{ nodeId: 'old-descendant' }, { nodeId: id }] });
});

it('does not resurrect a parent removed while waiting for the receipt', async () => {
  const id = await seedRegion();
  const { deletion, resolve } = deferDelete();
  useWorkspaceStore.setState((state) => ({
    nodeOrder: state.nodeOrder.filter((nodeId) => nodeId !== 'node-1'),
    nodesById: Object.fromEntries(Object.entries(state.nodesById).filter(([nodeId]) => nodeId !== 'node-1'))
  }));
  resolve({ deletedNodeIds: [id] });
  await deletion;
  expect(useWorkspaceStore.getState().nodesById['node-1']).toBeUndefined();
  expect(useWorkspaceStore.getState().nodeOrder).not.toContain('node-1');
  expect(useWorkspaceStore.getState().trashedNodeIds).toContain(id);
});
