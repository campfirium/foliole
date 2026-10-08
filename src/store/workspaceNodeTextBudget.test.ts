import { beforeEach, expect, it, vi } from 'vitest';

import { NODE_TEXT_MAX_BYTES } from '../../lib/core/nodes/nodeTextBudget';
import { showAppRuntimeNotice } from '../shared/ui/AppRuntimeNotice';

import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

vi.mock('../shared/ui/AppRuntimeNotice', () => ({ showAppRuntimeNotice: vi.fn() }));
const large = '雪'.repeat(Math.floor(NODE_TEXT_MAX_BYTES / 3) + 1);
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  const initial = createInitialWorkspaceState(new Date('2026-10-09'));
  const seed = initial.nodesById['node-1']!;
  useWorkspaceStore.setState({ ...initial, nodeOrder: ['source', 'annotation', 'item'], nodesById: {
    ...initial.nodesById,
    source: { ...seed, id: 'source', content: 'original', title: 'Original', parentNodeId: null, bodyStatus: 'ready' },
    annotation: { ...seed, id: 'annotation', content: 'quote', parentNodeId: 'source', bodyStatus: 'ready',
      anchorLink: { id: 'link', kind: 'highlight', locator: { from: 0, to: 5, originalText: 'quote' } } },
    item: { ...seed, id: 'item', kind: 'item', content: 'prompt', reveal: 'answer', parentNodeId: 'source', bodyStatus: 'ready' }
  } });
});
it.each(['annotation', 'item'])('rejects oversized content before publishing %s state', async nodeId => {
  const before = useWorkspaceStore.getState();
  expect(await before.updateNodeContent(nodeId, large)).toBe(false);
  expect(useWorkspaceStore.getState().nodesById).toBe(before.nodesById);
  expect(showAppRuntimeNotice).toHaveBeenCalledOnce();
});
it('shortens an oversized manual title and saves it with a notice', async () => {
  expect(await useWorkspaceStore.getState().updateNodeTitle('source', large)).toBe(true);
  const node = useWorkspaceStore.getState().nodesById.source!;
  expect(node.title).toBe('雪'.repeat(100));
  expect(node.content).toBe('original');
  expect(node.isTitleManual).toBe(true);
  expect(showAppRuntimeNotice).toHaveBeenCalledOnce();
});
it.each([100, 101])('counts %s Unicode title characters without splitting surrogate pairs', async count => {
  expect(await useWorkspaceStore.getState().updateNodeTitle('source', '😀'.repeat(count))).toBe(true);
  expect(useWorkspaceStore.getState().nodesById.source!.title).toBe('😀'.repeat(100));
  expect(showAppRuntimeNotice).toHaveBeenCalledTimes(count === 100 ? 0 : 1);
});
it('notifies about an oversized title whose saved prefix already matches without changing state', async () => {
  const title = '😀'.repeat(100);
  const nodes = useWorkspaceStore.getState().nodesById;
  useWorkspaceStore.setState({ nodesById: { ...nodes, source: { ...nodes.source!, title } } });
  const before = useWorkspaceStore.getState();
  expect(await before.updateNodeTitle('source', `${title}extra`)).toBe(false);
  expect(useWorkspaceStore.getState().nodesById).toBe(before.nodesById);
  expect(useWorkspaceStore.getState().appActionHistory).toBe(before.appActionHistory);
  expect(showAppRuntimeNotice).toHaveBeenCalledOnce();
});
it('rejects an oversized answer without changing the original', async () => {
  const before = useWorkspaceStore.getState();
  expect(await before.updateNodeReveal('item', large)).toBe(false);
  expect(useWorkspaceStore.getState().nodesById).toBe(before.nodesById);
  expect(showAppRuntimeNotice).toHaveBeenCalledOnce();
});
it('rejects highlight, question and child item creation without adding nodes or history', async () => {
  const before = useWorkspaceStore.getState();
  expect(await before.createHighlightNodeFromSelection('source', large)).toBeNull();
  expect(await before.createQANodeFromSelection('source', 'prompt', large)).toBeNull();
  expect(await before.createChildNode('source', large, 'item')).toBeNull();
  expect(useWorkspaceStore.getState().nodesById).toBe(before.nodesById);
  expect(useWorkspaceStore.getState().nodeOrder).toBe(before.nodeOrder);
  expect(useWorkspaceStore.getState().appActionHistory).toBe(before.appActionHistory);
});
it('prevents a direct oversized ordinary body update from bypassing the editor split flow', async () => {
  const before = useWorkspaceStore.getState();
  expect(await before.updateNodeContent('source', large)).toBe(false);
  expect(useWorkspaceStore.getState().nodesById).toBe(before.nodesById);
});
