import { afterEach, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import { settleEditorAnnotationCreation } from './workspaceEditorAnnotationCreationSettlement';
import { createHighlightFromSelectionAction } from './workspaceStoreCreateActions';
import { createWorkspaceNodeActionsFixture, createWorkspaceNodeActionsSetStateHarness } from './workspaceStoreNodeActions.test-support';

vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

it.each([true, false])('creates one cross-page excerpt and rolls it back if persistence fails, saved=%s', async saved => {
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn());
  const state = createWorkspaceNodeActionsFixture();
  const harness = createWorkspaceNodeActionsSetStateHarness(state);
  state.settleEditorAnnotationCreation = result => settleEditorAnnotationCreation(harness.setState, result);
  const anchor = { id: 'one-anchor', kind: 'highlight' as const, locator: {
    pages: [1, 3].map(page => ({ page, x: 0.2, y: 0.3, rects: [{ x: 0.1, y: 0.2, width: 0.2, height: 0.1 }] }))
  } };
  const create = createHighlightFromSelectionAction(harness.setState, {
    syncNodeContent: () => undefined, syncNodeOrder: () => undefined,
    syncNodeCreation: async (node) => saved ? {
      createdNodeIds: [node.id], nodes: [{
        nodeId: node.id, parentNodeId: node.parentNodeId, kind: node.kind,
        title: node.title, isTitleManual: false, content: node.content, reveal: null,
        anchorLink: node.anchorLink ?? null, imageRegions: null, position: 0,
        createdAt: node.createdAt, updatedAt: node.updatedAt
      }]
    } : null
  }, harness.getState);
  const id = await create('node-1', 'First page\nLast page', anchor.id, anchor);
  const excerpts = Object.values(harness.getState().nodesById).filter(node => node.anchorLink?.id === anchor.id);
  expect(excerpts).toHaveLength(saved ? 1 : 0);
  if (saved) {
    expect(id).toBe(excerpts[0]?.id);
    expect(excerpts[0]?.anchorLink).toEqual(anchor);
    expect(excerpts[0]?.content).toBe('First page\nLast page');
  } else expect(id).toBeNull();
});
