import { expect, it, vi } from 'vitest';

import { createHighlightFromSelectionAction, createQAFromSelectionAction } from './workspaceStoreCreateActions';
import { createWorkspaceNodeActionsFixture, createWorkspaceNodeActionsSetStateHarness } from './workspaceStoreNodeActions.test-support';

vi.mock('./workspaceRuntimeSync', async (importOriginal) => ({
  ...await importOriginal<typeof import('./workspaceRuntimeSync')>(), hasWorkspaceNodeMutationRuntime: () => false
}));

function setup(parentNodeId: string | null = 'node-1') {
  const state = createWorkspaceNodeActionsFixture();
  const item = { ...state.nodesById['node-1']!, id: 'item', kind: 'item' as const,
    parentNodeId, content: 'Rewritten [...] Gamma', reveal: 'Beta', hasReveal: true };
  state.nodesById.item = item;
  state.nodeOrder.push('item');
  state.activeNodeId = 'item';
  const harness = createWorkspaceNodeActionsSetStateHarness(state);
  const handlers = { syncNodeContent: vi.fn(), syncNodeOrder: vi.fn(), syncNodeCreation: vi.fn(async () => null) };
  return { harness, handlers, item,
    highlight: createHighlightFromSelectionAction(harness.setState, handlers, harness.getState),
    cloze: createQAFromSelectionAction(harness.setState, handlers, harness.getState) };
}

it('creates a sibling highlight from an edited Item without attaching Item coordinates to its parent', async () => {
  const { highlight, harness, handlers, item } = setup();
  const id = await highlight('item', 'Gamma', 'new-highlight', {
    id: 'new-highlight', kind: 'highlight', locator: { from: 16, to: 21, originalText: 'Gamma' }
  });
  expect(id).toBeTruthy();
  expect(harness.getState().nodesById[id!]).toMatchObject({ parentNodeId: 'node-1', kind: 'topic', content: 'Gamma', anchorLink: null });
  expect(harness.getState().nodesById.item).toEqual(item);
  expect(handlers.syncNodeCreation).toHaveBeenCalledWith(expect.objectContaining({ parentNodeId: 'node-1' }), 'item');
});

it('restores the old cloze while creating a new sibling cloze from current edited text', async () => {
  const { cloze, harness } = setup();
  const id = await cloze('item', 'Rewritten [...] [...]', 'Gamma', 'new-cloze', {
    id: 'new-cloze', kind: 'cloze', locator: { from: 16, to: 21, originalText: 'Gamma' }
  });
  expect(harness.getState().nodesById[id!]).toMatchObject({
    parentNodeId: 'node-1', content: 'Rewritten Beta [...]', reveal: 'Gamma', anchorLink: null, kind: 'item'
  });
});

it('restores an old cloze selected as a highlight, including its comment', async () => {
  const { highlight, harness } = setup();
  const id = await highlight('item', '[...]\n※ My note', 'new-highlight', {
    id: 'new-highlight', kind: 'highlight', locator: { from: 10, to: 15, originalText: '[...]' }
  });
  expect(harness.getState().nodesById[id!]).toMatchObject({ content: 'Beta\n※ My note', parentNodeId: 'node-1' });
});

it('creates a root sibling when the Item is at the root', async () => {
  const { highlight, harness } = setup(null);
  const id = await highlight('item', 'Gamma');
  expect(harness.getState().nodesById[id!]?.parentNodeId).toBeNull();
});

it('keeps Topic selection annotations as anchored children', async () => {
  const { highlight, harness } = setup();
  const anchorLink = { id: 'topic-selection', kind: 'highlight' as const, locator: { from: 2, to: 6, originalText: 'Seed' } };
  const id = await highlight('node-1', 'Seed', anchorLink.id, anchorLink);
  expect(harness.getState().nodesById[id!]).toMatchObject({ parentNodeId: 'node-1', anchorLink });
});
