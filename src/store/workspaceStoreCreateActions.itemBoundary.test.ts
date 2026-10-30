import { expect, it, vi } from 'vitest';

import { createHighlightFromSelectionAction, createQAFromSelectionAction } from './workspaceStoreCreateActions';
import { createWorkspaceNodeActionsFixture, createWorkspaceNodeActionsSetStateHarness } from './workspaceStoreNodeActions.test-support';

vi.mock('./workspaceRuntimeSync', async (importOriginal) => ({
  ...await importOriginal<typeof import('./workspaceRuntimeSync')>(), hasWorkspaceNodeMutationRuntime: () => false
}));

function setup(kind: 'item' | 'topic', parentNodeId: string | null = 'node-1') {
  const state = createWorkspaceNodeActionsFixture();
  state.nodesById.source = { ...state.nodesById['node-1']!, id: 'source', kind,
    parentNodeId, content: 'Alpha [...] Gamma', reveal: kind === 'item' ? 'Beta' : null };
  state.nodeOrder.push('source');
  const harness = createWorkspaceNodeActionsSetStateHarness(state);
  const handlers = { syncNodeContent: vi.fn(), syncNodeOrder: vi.fn(), syncNodeCreation: vi.fn(async () => null) };
  return { harness, handlers,
    highlight: createHighlightFromSelectionAction(harness.setState, handlers, harness.getState),
    cloze: createQAFromSelectionAction(harness.setState, handlers, harness.getState) };
}

it.each([null, 'node-1'])('refuses highlight, annotated highlight and cloze creation inside an Item with parent %s', async parent => {
  const { harness, handlers, highlight, cloze } = setup('item', parent);
  const before = harness.getState();
  const anchor = { id: 'new', kind: 'highlight' as const, locator: { from: 12, to: 17, originalText: 'Gamma' } };
  expect(await highlight('source', 'Gamma', 'new', anchor)).toBeNull();
  expect(await highlight('source', 'Gamma\n※ Comment', 'new', anchor)).toBeNull();
  expect(await cloze('source', 'Alpha [...] [...]', 'Gamma', 'new', { ...anchor, kind: 'cloze' })).toBeNull();
  expect(harness.getState().nodesById).toEqual(before.nodesById);
  expect(harness.getState().nodeOrder).toEqual(before.nodeOrder);
  expect(harness.getState().editorOperationHistory).toEqual(before.editorOperationHistory);
  expect(handlers.syncNodeCreation).not.toHaveBeenCalled();
});

it('continues creating anchored highlights and clozes under a Topic', async () => {
  const { harness, highlight, cloze } = setup('topic');
  const anchor = { id: 'new', kind: 'highlight' as const, locator: { from: 12, to: 17, originalText: 'Gamma' } };
  const highlightId = await highlight('source', 'Gamma', 'new', anchor);
  const itemId = await cloze('source', 'Alpha [...] [...]', 'Gamma', 'new-cloze', { ...anchor, id: 'new-cloze', kind: 'cloze' });
  expect(harness.getState().nodesById[highlightId!]).toMatchObject({ parentNodeId: 'source', content: 'Gamma', anchorLink: anchor });
  expect(harness.getState().nodesById[itemId!]).toMatchObject({ parentNodeId: 'source', kind: 'item', reveal: 'Gamma',
    anchorLink: { ...anchor, id: 'new-cloze', kind: 'cloze' } });
});
