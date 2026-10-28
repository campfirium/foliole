import { afterEach, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';

import { projectWorkspaceListNodesById } from '../features/nodes/model/workspaceListNode';
import { createWorkspaceRuntimeNodeSnapshot } from '../shared/platform/workspaceRuntimeNodeRepository';

import { resetNodeContentVersionGuardForTests } from './workspaceNodeContentVersionGuard';
import type { WorkspaceState } from './workspaceStore';
import { createUpdateNodeContentAction } from './workspaceStoreContentActions';
import { drainPendingNodeContentRuntimePersists, resetPendingNodeContentRuntimePersistsForTests } from './workspaceStoreContentRuntimePersist';
import { createWorkspaceNodeActionsFixture } from './workspaceStoreNodeActions.test-support';
import { withWorkspaceRendererBoundary } from './workspaceStoreRendererBoundary';

vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => vi.fn() }));
vi.mock('./workspaceRuntimeSync', async (importOriginal) => ({
  ...await importOriginal<typeof import('./workspaceRuntimeSync')>(),
  hasWorkspaceNodeMutationRuntime: () => true,
  syncNodeContentWithAnchorsMutationToRuntime: vi.fn(async () => null)
}));

afterEach(() => {
  resetPendingNodeContentRuntimePersistsForTests();
  resetNodeContentVersionGuardForTests();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function createPublicationFixture() {
  const fixture = createWorkspaceNodeActionsFixture();
  const parent = fixture.nodesById['node-1']!;
  fixture.nodesById['node-1'] = { ...parent, content: 'Alpha Beta', currentVersionId: 'ver_base' };
  fixture.nodesById.child = {
    ...parent, id: 'child', parentNodeId: 'node-1', content: '', hasContent: true,
    anchorLink: { id: 'highlight', kind: 'highlight', locator: { from: 6, to: 10, originalText: 'Beta' } }
  };
  let unrelatedReads = 0;
  for (let index = 0; index < 100; index += 1) {
    const id = `unrelated-${index}`;
    fixture.nodesById[id] = new Proxy({ ...parent, id, content: '' }, {
      get(target, key, receiver) {
        if (key === 'title') unrelatedReads += 1;
        return Reflect.get(target, key, receiver);
      }
    });
    fixture.nodeOrder.push(id);
  }
  fixture.nodeOrder.push('child');
  const store = createStore<WorkspaceState>(() => fixture);
  const set: Parameters<typeof createUpdateNodeContentAction>[0] = (input) => store.setState((state) => {
    const patch = typeof input === 'function' ? input(state) : input;
    return patch === state ? state : withWorkspaceRendererBoundary(patch, state);
  });
  let projection = projectWorkspaceListNodesById(store.getState().nodesById);
  const publications: WorkspaceState['nodesById'][] = [];
  store.subscribe((state, previous) => {
    if (state.nodesById === previous.nodesById) return;
    publications.push(state.nodesById);
    projection = projectWorkspaceListNodesById(state.nodesById, projection);
  });
  unrelatedReads = 0;
  return { store, update: createUpdateNodeContentAction(set), publications,
    projection: () => projection, reads: () => unrelatedReads };
}

it.each([false, true])('checks only affected nodes for a content publication (publishLocal=%s)', async (publishLocal) => {
  vi.useFakeTimers();
  const fixture = createPublicationFixture();
  const unrelated = fixture.store.getState().nodesById['unrelated-0'];
  await fixture.update('node-1', 'Start Alpha Beta', { publishLocal });
  expect(fixture.store.getState().nodesById['node-1']?.content).toBe('Start Alpha Beta');
  expect(fixture.store.getState().nodesById['unrelated-0']).toBe(unrelated);
  expect(fixture.reads()).toBe(0);
  expect(fixture.publications).toHaveLength(1);
  if (publishLocal) {
    expect(fixture.publications[0]?.child?.anchorLink?.locator).toEqual({ from: 12, to: 16, originalText: 'Beta' });
  }
});

it('checks only affected nodes when the runtime confirms normalized content', async () => {
  vi.useFakeTimers();
  const { syncNodeContentWithAnchorsMutationToRuntime } = await import('./workspaceRuntimeSync');
  const fixture = createPublicationFixture();
  vi.mocked(syncNodeContentWithAnchorsMutationToRuntime).mockImplementationOnce(async (node) => ({
    nodes: [{ ...createWorkspaceRuntimeNodeSnapshot(node, 0), content: 'Confirmed body', title: 'Confirmed title' }],
    contentEdit: { submittedVersionId: 'ver_submitted', currentVersionId: 'ver_current' }
  }));
  await fixture.update('node-1', 'Local body', { publishLocal: false });
  await expect(drainPendingNodeContentRuntimePersists()).resolves.toBe(true);
  expect(fixture.store.getState().nodesById['node-1']).toMatchObject({
    content: 'Confirmed body', title: 'Confirmed title', currentVersionId: 'ver_current'
  });
  expect(fixture.projection()['node-1']).toMatchObject({ title: 'Confirmed title', hasContent: true });
  expect(fixture.reads()).toBe(0);
  expect(fixture.publications).toHaveLength(2);
});

it('keeps newer input visible when an older save returns, then publishes the next receipt', async () => {
  vi.useFakeTimers();
  const { syncNodeContentWithAnchorsMutationToRuntime } = await import('./workspaceRuntimeSync');
  const fixture = createPublicationFixture();
  let resolveFirst!: (value: Awaited<ReturnType<typeof syncNodeContentWithAnchorsMutationToRuntime>>) => void;
  vi.mocked(syncNodeContentWithAnchorsMutationToRuntime).mockImplementationOnce(
    () => new Promise(resolve => { resolveFirst = resolve; }));
  await fixture.update('node-1', 'First body', { publishLocal: false });
  const first = drainPendingNodeContentRuntimePersists();
  await fixture.update('node-1', 'Continued body', { publishLocal: false });
  resolveFirst({
    nodes: [{ ...createWorkspaceRuntimeNodeSnapshot(fixture.store.getState().nodesById['node-1']!, 0), content: 'Old merge' }],
    contentEdit: { submittedVersionId: 'ver_first', currentVersionId: 'ver_merge' }
  });
  await first;
  expect(fixture.store.getState().nodesById['node-1']).toMatchObject({ content: 'Continued body', currentVersionId: 'ver_first' });
  vi.mocked(syncNodeContentWithAnchorsMutationToRuntime).mockImplementationOnce(async node => ({
    nodes: [createWorkspaceRuntimeNodeSnapshot(node, 0)],
    contentEdit: { submittedVersionId: 'ver_second', currentVersionId: 'ver_second' }
  }));
  await expect(drainPendingNodeContentRuntimePersists()).resolves.toBe(true);
  expect(fixture.store.getState().nodesById['node-1']).toMatchObject({ content: 'Continued body', currentVersionId: 'ver_second' });
  expect(fixture.reads()).toBe(0);
});
